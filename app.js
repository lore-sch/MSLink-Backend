//backend server to handle routes and set up database connection
const express = require('express')
const { Pool } = require('pg') //creates pool of database connections

const app = express() //instance of express
app.use(express.json()) //middleware function of req/res (use of api)

//connect to postgres database with a new pool (new connection)
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'mslink',
  password: 'bed_drift_mild',
  port: 5432,
})

// server port connection
const port = 3000
app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})

//post route for sign up page- email and password
app.post('/SignUp', async (req, res) => {
  try {
    const { userEmail, userPassword } = req.body
    const query =
      'INSERT INTO user_credentials (user_email, user_password) VALUES ($1, $2) RETURNING *'
    const values = [userEmail, userPassword]
    const result = await pool.query(query, values)

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error signing up', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//post route for profile set up
app.post('/ProfileSetupPage', async (req, res) => {
  try {
    const { userName, userStory } = req.body
    const query =
      'INSERT INTO user_profile (user_story, user_id, image_id, user_profile_name) VALUES ($1, 1, 1, $2 ) RETURNING *'
    const values = [userName, userStory]
    const result = await pool.query(query, values)

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error saving profile', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//route for user to post new status to live feed
app.post('/LiveFeed', async (req, res) => {
  try {
    const { userPost } = req.body
    const query =
      'INSERT INTO user_post (user_post, user_post_timestamp, user_id) VALUES ($1, CURRENT_TIMESTAMP, 2) RETURNING *'
    const values = [userPost]
    const result = await pool.query(query, values)

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error submitting post', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//gets posts ordered by date/time from database
app.get('/LiveFeed', async (req, res) => {
  try {
    const query = `
    SELECT user_post.*, user_profile.user_profile_name
    FROM user_post
    JOIN user_credentials ON user_post.user_id = user_credentials.user_id
    JOIN user_profile ON user_credentials.user_id = user_profile.user_profile_id
    ORDER BY user_post.user_post_timestamp DESC
    `
    const result = await pool.query(query)
    res.status(200).json(result.rows)
  } catch (error) {
    console.error('Error fetching posts', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//route to post comments to individual posts
app.post('/PostResponse', async (req, res) => {
  try {
    const { userComment } = req.body
    const query =
      'INSERT INTO post_comment (post_comment, user_post_id, user_id, post_comment_timestamp) VALUES ($1, 12, 2, CURRENT_TIMESTAMP) RETURNING *'
    const values = [userComment]
    console.log(post_comment, user_post_id, user_id, post_comment_timestamp)
    const result = await pool.query(query, values)

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error submitting post', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/PostResponse', async (req, res) => {
  const { user_post_id } = req.query; // Get the user_post_id from the query parameters
  try {
    const query = `
      SELECT *
      FROM post_comment
      JOIN user_credentials ON user_credentials.user_id = post_comment.user_id
      JOIN user_post ON user_post.user_post_id = post_comment.user_post_id
      WHERE user_post.user_post_id = $1
      ORDER BY post_comment_timestamp DESC
    `;

    const result = await pool.query(query, [user_post_id]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching comments', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

