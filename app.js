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

//set up log in authentication
app.post('/LogIn', async (req, res) => {
  try {
    const { userEmail, userPassword } = req.body;
    const query = 'SELECT * FROM user_credentials WHERE user_email = $1 AND user_password = $2';
    const values = [userEmail, userPassword];
    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
      res.status(200).json({ success: true, message: 'Authentication successful' });
    } else {
      res.status(401).json({ success: false, message: 'Authentication failed' });
    }
  } catch (error) {
    console.error('Error signing in', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    const { userComment, user_post_id, user_id } = req.body
    const query =
      'INSERT INTO post_comment (post_comment, user_post_id, user_id, post_comment_timestamp) VALUES ($1, $2, 2, CURRENT_TIMESTAMP) RETURNING *'
    const values = [userComment, user_post_id]
    const result = await pool.query(query, values)

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error submitting post', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Renders comments and user profile name on each post
app.get('/PostResponse', async (req, res) => {
  const { user_post_id } = req.query; 
  try {
    const query = `
    SELECT post_comment.*, user_profile.user_profile_name
    FROM post_comment
    JOIN user_credentials ON user_credentials.user_id = post_comment.user_id
    JOIN user_post ON user_post.user_post_id = post_comment.user_post_id
    JOIN user_profile ON user_credentials.user_id = user_profile.user_profile_id
    WHERE user_post.user_post_id = $1
    ORDER BY post_comment_timestamp DESC;
    `;

    const result = await pool.query(query, [user_post_id]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching comments', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//post emoji reactions to database
//This query needs looked at to stop duplicate rows
app.post('/PostReaction', async (req, res) => {
  try {
    const { user_post_id, reactionType } = req.body;

    // Check if a row with the same user_post_id exists in the post_reactions table
    const queryCheckExisting = 'SELECT * FROM post_reactions WHERE user_post_id = $1';
    const valuesCheckExisting = [user_post_id];
    const existingReaction = await pool.query(queryCheckExisting, valuesCheckExisting);

    if (existingReaction.rows.length === 0) {
      // If no existing reaction, insert a new row for the specific post
      const reactionValues = {
        like: 0,
        love: 0,
        laugh: 0,
        sad: 0,
        anger: 0,
      };

      // Increment the count for the corresponding emoji
      reactionValues[reactionType] += 1;

      const queryInsert = 'INSERT INTO post_reactions (user_post_id, post_like, post_love, post_laugh, post_sad, post_anger) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *';
      const valuesInsert = [
        user_post_id,
        reactionValues.like,
        reactionValues.love,
        reactionValues.laugh,
        reactionValues.sad,
        reactionValues.anger,
      ];

      const resultInsert = await pool.query(queryInsert, valuesInsert);
      res.status(201).json(resultInsert.rows[0]);
    } else {
      // If existing reaction, update the count for the corresponding emoji
      const reactionValues = {
        like: existingReaction.rows[0].post_like,
        love: existingReaction.rows[0].post_love,
        laugh: existingReaction.rows[0].post_laugh,
        sad: existingReaction.rows[0].post_sad,
        anger: existingReaction.rows[0].post_anger,
      };

      // Increment the count for the corresponding emoji
      reactionValues[reactionType] += 1;

      const queryUpdate = 'UPDATE post_reactions SET post_like = $1, post_love = $2, post_laugh = $3, post_sad = $4, post_anger = $5 WHERE user_post_id = $6 RETURNING *';
      const valuesUpdate = [
        reactionValues.like,
        reactionValues.love,
        reactionValues.laugh,
        reactionValues.sad,
        reactionValues.anger,
        user_post_id,
      ];

      const resultUpdate = await pool.query(queryUpdate, valuesUpdate);
      res.status(200).json(resultUpdate.rows[0]);
    }

    // Delete any duplicate rows in post_reactions
    const queryDeleteDuplicateRows = `
      DELETE FROM post_reactions
      WHERE ctid NOT IN (
        SELECT min(ctid)
        FROM post_reactions
        GROUP BY user_post_id, post_like, post_love, post_laugh, post_sad, post_anger
      )
    `;
    await pool.query(queryDeleteDuplicateRows);
  } catch (error) {
    console.error('Error submitting post', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/PostReactionCount', async (req, res) => {
  const { user_post_id } = req.query;
  try {
    const query = `
    SELECT * FROM post_reactions WHERE user_post_id = $1
    `
    const result = await pool.query(query, [user_post_id])
    
    res.status(200).json(result.rows)
  } catch (error) {
    console.error('Error fetching posts', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})




















