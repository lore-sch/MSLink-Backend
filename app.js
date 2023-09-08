//backend server to handle routes and set up database connection
const express = require('express')
const { Pool } = require('pg') //creates pool of database connections

const app = express() //instance of express
app.use(express.json()) //middleware function of req/res (use of api)
app.use('/uploads', express.static('uploads')) //static directory for images
const jwt = require('jsonwebtoken') //jwt web library import
const crypto = require('crypto') //node crypto to has the secret key
const multer = require('multer') //import multer for file uploads

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

//Generates JWT token function using user_id and user_email
const generateToken = (user) => {
  //Define payload with user infomration
  const payload = {
    userId: user.user_id,
    useremail: user.user_email,
  }
  //Creates secure secret key hashed, avoids being hardcoded in code
  const generateSecretKey = () => {
    return crypto.randomBytes(64).toString('hex')
  }
  //Creates random secret key to sign token 
  const secretKey = generateSecretKey()
  //Set access token expiration to 1 hour
  const options = {
    expiresIn: '1h',
  }
  //Generate accesstoken with payload and secret key
  const token = jwt.sign(payload, secretKey, options)
  //Generate refresh token nwith user_id and new secret key
  const refreshToken = jwt.sign({ userId: user.user_id }, generateSecretKey(), {
    expiresIn: '30d',
  })
  //Returns access token and refresh token
  return { token, refreshToken }
}

//Defines storage for multer 
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // Destination folder where the uploaded files will be saved
  },
  filename: function (req, file, cb) {
    // Current timestamp used in filename to avoid conflicts
    cb(null, Date.now() + '-' + file.originalname)
  },
})

// Initialize the multer middleware with the storage configuration
const upload = multer({ storage: storage })

// Endpoint for user login authentication
app.post('/LogIn', async (req, res) => {
  try {
    // Extract user credentials from the request body
    const { userEmail, userPassword } = req.body;
    // SQL query to check if the user exists in the database
    const query = `SELECT * FROM user_credentials 
                  WHERE user_email = $1 
                  AND user_password = $2`
    const values = [userEmail, userPassword]
    // Execute the SQL query using the database connection pool
    const result = await pool.query(query, values)
    // Check if the query returned any matching user
    if (result.rows.length > 0) {
      // Retrieve the user details
      const user = result.rows[0]
      // Generate JWT tokens for the user
      const tokens = generateToken(user)
      const token = tokens.token;
      refreshToken = tokens.refreshToken;
      // Send a successful response with tokens and user_id
      res.status(200).json({
        success: true,
        message: 'Authentication successful',
        data: { token, refreshToken, user_id: user.user_id },
      })
    } else {
      // Send an authentication failed response
      res.status(401).json({ success: false, message: 'Authentication failed' })
    }
  } catch (error) {
    // Handle any errors that occur during the login process
    console.error('Error signing in', error);
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Post route for sign up page- email and password
app.post('/SignUp', async (req, res) => {
  try {
    const { userEmail, userPassword } = req.body
    const query =
      `INSERT INTO user_credentials (user_email, user_password) 
      VALUES ($1, $2) RETURNING *`
    const values = [userEmail, userPassword]
    const result = await pool.query(query, values)

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error signing up', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Route to get user credential details for comparison at sign up- check if email exists
app.get('/SignUp', async (req, res) => {
  try {
    const { user_email } = req.query
    const query =
      `SELECT user_email FROM user_credentials 
      WHERE user_email = $1`
    const values = [user_email]
    const result = await pool.query(query, values)

    res.status(201).json(result.rows)
  } catch (error) {
    console.error('Error retrieving user credentials', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Route to get profile information and image URL using user_id
app.get('/ProfileEditPage', async (req, res) => {
  try {
    const { user_id } = req.query
    const query =
      'SELECT user_profile.*, image.image_path ' +
      'FROM user_profile ' +
      'LEFT JOIN image ON user_profile.image_id = image.image_id ' +
      'WHERE user_profile.user_id = $1'

    const result = await pool.query(query, [user_id])

    if (result.rows.length > 0) {
      const userProfileWithImage = result.rows[0]
      res.status(200).json(userProfileWithImage)
    } else {
      console.log('Profile not set up yet for:', user_id)
      res.status(200).json({})
    }
  } catch (error) {
    console.error('Error getting profile', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})


// Route to get profile information and image URL- when username clicked on
app.get('/ProfileEditPageByUsername', async (req, res) => {
  try {
    const { user_profile_id } = req.query
    const query =
      'SELECT user_profile.*, image.image_path ' +
      'FROM user_profile ' +
      'LEFT JOIN image ON user_profile.image_id = image.image_id ' +
      'WHERE user_profile.user_profile_id = $1'

    const result = await pool.query(query, [user_profile_id])

    if (result.rows.length > 0) {
      const userProfileWithImage = result.rows[0]
      res.status(200).json(userProfileWithImage)
    } else {
      //console error for developer, cant retrieve profile
      console.log(
        'User profile not found for user_profile_id:',
        user_profile_id
      )
      res.status(404).json({ error: 'User profile not found' })
    }
  } catch (error) {
    console.error('Error getting profile', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Post route to edit profile page
//Tries to update existing profile, checks if rows changed, then inserts if not
app.post('/ProfileEditPage', upload.single('image'), async (req, res) => {
  const { userName, userStory, user_id } = req.body
  let client = null
  try {
    client = await pool.connect()
    await client.query('BEGIN')

    // Check if an image was uploaded and insert it into the image table
    let image_id = null
    if (req.file) {
      const image_path = req.file.path

      // Check if the image already exists in the image table based on the image_path
      const checkImageQuery = 'SELECT image_id FROM image WHERE image_path = $1'
      const checkImageValues = [image_path]
      const checkImageResult = await client.query(
        checkImageQuery,
        checkImageValues
      )

      if (checkImageResult.rowCount > 0) {
        // If the image already exists, use its image_id
        image_id = checkImageResult.rows[0].image_id
      } else {
        // If the image doesn't exist, insert it into the image table and get its image_id
        const imageQuery =
          'INSERT INTO image (image_path) VALUES ($1) RETURNING image_id'
        const imageValues = [image_path]
        const imageResult = await client.query(imageQuery, imageValues)
        image_id = imageResult.rows[0].image_id
      }
    }

    // Try to update the existing profile, and if no rows are changed, insert a new profile
    const updateQuery =
      'UPDATE user_profile SET user_story = $1, user_profile_name = $2, image_id = $3 WHERE user_id = $4 RETURNING *'
    const updateValues = [userStory, userName, image_id, user_id]
    const updateResult = await client.query(updateQuery, updateValues)

    if (updateResult.rowCount > 0) {
      await client.query('COMMIT') // profile updates
      res.status(201).json(updateResult.rows[0])
    } else {
      const insertQuery =
        'INSERT INTO user_profile (user_story, user_profile_name, user_id, image_id) VALUES ($1, $2, $3, $4) RETURNING *'
      const insertValues = [userStory, userName, user_id, image_id]
      const insertResult = await client.query(insertQuery, insertValues)
      await client.query('COMMIT') // new profile is inserted
      res.status(201).json(insertResult.rows[0])
    }
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error saving profile', error)
    res.status(500).json({ error: 'Internal server error' })
  } finally {
    if (client) {
      client.release()
    }
  }
})

//Route for user to post new status and image to live feed
app.post('/LiveFeed', upload.single('image'), async (req, res) => {
  try {
    const { userPost, user_id } = req.body
    const image_path = req.file ? req.file.path : null // Check if an image is included in the request
    if (image_path) {
      // If an image is present, insert image data into the database
      const imageQuery =
        'INSERT INTO image (image_path) VALUES ($1) RETURNING image_id'
      const imageValues = [image_path]
      const imageResult = await pool.query(imageQuery, imageValues)
      const image_id = imageResult.rows[0].image_id
      // Insert image data into the user_image table
      const userImageQuery =
        'INSERT INTO user_image (user_id, image_id, user_post_timestamp) VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING *'
      const userImageValues = [user_id, image_id]
      const userImageResult = await pool.query(userImageQuery, userImageValues)
      res.status(201).json(userImageResult.rows[0])
    } else {
      // If no image is present, insert only the text data into the database
      const query =
        'INSERT INTO user_post (user_post, user_post_timestamp, user_id) VALUES ($1, CURRENT_TIMESTAMP, $2) RETURNING *'
      const values = [userPost, user_id]
      const result = await pool.query(query, values)
      res.status(201).json(result.rows[0])
    }
  } catch (error) {
    console.error('Error submitting post', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Delete images posted by a user and corresponding comments and reactions
app.post('/DeleteUserImage', async (req, res) => {
  const { user_image_id, user_id } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Delete comments associated with the image
    const deleteImageCommentsQuery =
      'DELETE FROM image_comment WHERE user_image_id = $1'
    await client.query(deleteImageCommentsQuery, [user_image_id])
    // Delete reactions on image
    const deleteImageReactionsQuery =
      'DELETE FROM image_reactions WHERE user_image_id = $1'
    await client.query(deleteImageReactionsQuery, [user_image_id])

    // Delete user image row from user_image
    const deleteUserImageQuery =
      'DELETE FROM user_image WHERE user_id = $1 AND user_image_id = $2 RETURNING *'
    const deleteUserImageValues = [user_id, user_image_id]
    const deleteUserImageResult = await client.query(
      deleteUserImageQuery,
      deleteUserImageValues
    )
    // Delete image data from image table
    const deleteImageQuery =
      'DELETE FROM image WHERE image_id = $1 AND NOT EXISTS (SELECT 1 FROM user_image WHERE image_id = image.image_id)'
    await client.query(deleteImageQuery, [user_image_id])
      //Commit transaction
    await client.query('COMMIT')

    res
      .status(200)
      .json({
        message:
          'Image, associated comments, and reactions deleted successfully',
      })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error deleting image, comments, and reactions', error)
    res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

//Delete posts from live feed and associated comments and reactions
app.post('/DeleteLiveFeedPost', async (req, res) => {
  const client = await pool.connect()
  try {
    const { user_post_id, user_id } = req.body

    // Begin a transaction
    await client.query('BEGIN')

    // Delete reactions associated with the post
    const deleteReactionsQuery =
      'DELETE FROM post_reactions WHERE user_post_id = $1'
    await client.query(deleteReactionsQuery, [user_post_id])

    // Delete comments associated with the post
    const deleteCommentsQuery =
      'DELETE FROM post_comment WHERE user_post_id = $1'
    await client.query(deleteCommentsQuery, [user_post_id])

    // Delete the post itself
    const deletePostQuery =
      'DELETE FROM user_post WHERE user_post_id = $1 AND user_id = $2 RETURNING *'
    const deletePostValues = [user_post_id, user_id]
    const deletePostResult = await client.query(
      deletePostQuery,
      deletePostValues
    )

    // Commit the transaction
    await client.query('COMMIT')

    res
      .status(200)
      .json({
        message:
          'Post, associated comments, and reactions deleted successfully',
      })
  } catch (error) {
    // If any error occurs, rollback the transaction
    await client.query('ROLLBACK')
    console.error('Error deleting post, comments, and reactions', error)
    res.status(500).json({ error: 'Internal server error' })
  } finally {
    // Release the client back to the pool
    client.release()
  }
})

//Gets posts, polls, images ordered by date/time from database
//Complex query which requires reconfiguration
app.get('/LiveFeed', async (req, res) => {
  try {
    const query = `
    SELECT
    'user_post' AS type,
    user_post.user_post_id::text as user_post_id,
    user_post.user_post,
    user_post.user_post_timestamp::character varying as user_post_timestamp,
    user_profile.user_profile_id,
    user_profile.user_profile_name,
    user_credentials.user_id,
    null as image_id,
    null as image_path,
    null as user_image_id,
    null as user_poll_question,
    null as user_poll_option_1,
    null as user_poll_option_2,
    null as user_poll_option_3,
    null as user_poll_id,
    null as user_poll_result_option_1,
    null as user_poll_result_option_2,
    null as user_poll_result_option_3,
    post_reactions.post_like,
    post_reactions.post_love,
    post_reactions.post_laugh,
    post_reactions.post_sad,
    post_reactions.post_anger
  FROM user_post
  JOIN user_credentials ON user_post.user_id = user_credentials.user_id
  JOIN user_profile ON user_credentials.user_id = user_profile.user_id
  LEFT JOIN post_reactions ON user_post.user_post_id = post_reactions.user_post_id
  
  UNION
  
  SELECT
    'user_image' AS type,
    null as user_post_id,
    null as user_post,
    user_image.user_post_timestamp::character varying as user_post_timestamp,
    user_profile.user_profile_id,
    user_profile.user_profile_name,
    user_credentials.user_id,
    image.image_id::text as image_id,
    image.image_path,
    user_image.user_image_id::text as user_image_id,
    null as user_poll_question,
    null as user_poll_option_1,
    null as user_poll_option_2,
    null as user_poll_option_3,
    null as user_poll_id,
    null as user_poll_result_option_1,
    null as user_poll_result_option_2,
    null as user_poll_result_option_3,
    image_reactions.post_like,
    image_reactions.post_love,
    image_reactions.post_laugh,
    image_reactions.post_sad,
    image_reactions.post_anger
  FROM user_image
  JOIN image ON user_image.image_id = image.image_id
  JOIN user_credentials ON user_image.user_id = user_credentials.user_id
  JOIN user_profile ON user_credentials.user_id = user_profile.user_id
  LEFT JOIN image_reactions ON user_image.user_image_id = image_reactions.user_image_id
  
  UNION
  
  SELECT
    'user_poll' AS type,
    null as user_post_id,
    null as user_post,
    user_poll.user_post_timestamp::character varying as user_post_timestamp,
    user_profile.user_profile_id,
    user_profile.user_profile_name,
    user_credentials.user_id,
    null as image_id,
    null as image_path,
    null as user_image_id,
    user_poll.user_poll_question as user_poll_question,
    user_poll.user_poll_option_1 as user_poll_option_1,
    user_poll.user_poll_option_2 as user_poll_option_2,
    user_poll.user_poll_option_3 as user_poll_option_3,
    user_poll.user_poll_id::text as user_poll_id,
    COALESCE(pr.user_poll_result_option_1::text, '0') as user_poll_result_option_1,
    COALESCE(pr.user_poll_result_option_2::text, '0') as user_poll_result_option_2,
    COALESCE(pr.user_poll_result_option_3::text, '0') as user_poll_result_option_3,
     null as post_like,
    null as post_love,
    null as post_laugh,
    null as post_sad,
    null as post_anger
  FROM user_poll
  JOIN user_credentials ON user_poll.user_id = user_credentials.user_id
  JOIN user_profile ON user_credentials.user_id = user_profile.user_id
  LEFT JOIN (
    SELECT
      user_poll_id,
      user_poll_result_option_1::text,
      user_poll_result_option_2::text,
      user_poll_result_option_3::text
    FROM user_poll_results
  ) as pr ON user_poll.user_poll_id = pr.user_poll_id
  ORDER BY user_post_timestamp DESC`
    const result = await pool.query(query)
    res.status(200).json(result.rows)
  } catch (error) {
    console.error('Error fetching posts', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Route to post comments to individual posts in Live Feed
app.post('/PostResponse', async (req, res) => {
  try {
    const { userComment, user_post_id, user_id } = req.body
    const query =
      `INSERT INTO post_comment (post_comment, user_post_id, user_id, post_comment_timestamp) 
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *`

    const values = [userComment, user_post_id, user_id]
    const result = await pool.query(query, values)

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error submitting post', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Delete post comment in Live Feed
app.post('/DeletePostComment', async (req, res) => {
  try {
    const { post_comment_id, user_id } = req.body
    const deleteQuery =
      'DELETE FROM post_comment WHERE post_comment_id = $1 AND user_id = $2 RETURNING *'
    const deleteResult = await pool.query(deleteQuery, [
      post_comment_id,
      user_id,
    ])

    res.status(200).json(deleteResult.rows[0])
  } catch (error) {
    console.error('Error deleting comment', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Post comment to images in Live Feed
app.post('/ImageResponse', async (req, res) => {
  try {
    const { userComment, user_image_id, user_id } = req.body
    const query =
      `INSERT INTO image_comment (post_comment, post_comment_timestamp, user_image_id, user_id) 
      VALUES ($1, CURRENT_TIMESTAMP, $2, $3) RETURNING *`
    const values = [userComment, user_image_id, user_id]
    const result = await pool.query(query, values)

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error submitting comment', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Delete image comment in Live Feed
app.post('/DeleteImageComment', async (req, res) => {
  try {
    const { image_comment_id, user_id } = req.body
    const deleteQuery =
      'DELETE FROM image_comment WHERE image_comment_id = $1 AND user_id = $2 RETURNING *'
    const deleteResult = await pool.query(deleteQuery, [
      image_comment_id,
      user_id,
    ])

    res.status(200).json(deleteResult.rows[0])
  } catch (error) {
    console.error('Error deleting comment', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Renders comments and user profile name on each post in Live Feed
app.get('/PostResponse', async (req, res) => {
  const { user_post_id } = req.query
  try {
    const query = `
    SELECT
    post_comment.*,
    user_profile.user_profile_name,
    user_profile.user_profile_id
    FROM post_comment
    JOIN user_credentials ON user_credentials.user_id = post_comment.user_id
    JOIN user_post ON user_post.user_post_id = post_comment.user_post_id
    JOIN user_profile ON user_credentials.user_id = user_profile.user_id
    WHERE user_post.user_post_id = $1
    ORDER BY post_comment_timestamp ASC`
    const result = await pool.query(query, [user_post_id])
    res.status(200).json(result.rows)

  } catch (error) {
    console.error('Error fetching comments', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Renders comments and user profile name on each image in Live Feed
app.get('/ImageResponse', async (req, res) => {
  const { user_image_id } = req.query
  try {
    const query = `
    SELECT
    image_comment.*,
    user_profile.user_profile_id,
    user_profile.user_profile_name,
    image.image_path
  FROM image_comment
  JOIN user_credentials ON user_credentials.user_id = image_comment.user_id
  JOIN user_profile ON user_credentials.user_id = user_profile.user_id
  JOIN user_image ON user_image.user_image_id = image_comment.user_image_id
  JOIN image ON user_image.image_id = image.image_id
  WHERE image_comment.user_image_id = $1
  ORDER BY post_comment_timestamp DESC`

    const result = await pool.query(query, [user_image_id])

    res.status(200).json(result.rows)
  } catch (error) {
    console.error('Error fetching image comments:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Post emoji reactions to database for posts in Live Feed
app.post('/SubmitReaction', async (req, res) => {
  try {
    const { user_post_id, reactionType } = req.body

    // Check if a row with the same user_post_id exists in the post_reactions table
    const queryCheckExisting =
      'SELECT * FROM post_reactions WHERE user_post_id = $1'
    const valuesCheckExisting = [user_post_id]
    const existingReaction = await pool.query(
      queryCheckExisting,
      valuesCheckExisting
    )

    if (existingReaction.rows.length === 0) {
      // If no existing reaction, insert a new row for the specific post
      const reactionValues = {
        like: 0,
        love: 0,
        laugh: 0,
        sad: 0,
        anger: 0,
      }

      // Increment the count for the corresponding emoji
      reactionValues[reactionType] += 1

      const queryInsert =
        `INSERT INTO post_reactions (user_post_id, post_like, post_love, post_laugh, post_sad, post_anger) 
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`
      const valuesInsert = [
        user_post_id,
        reactionValues.like,
        reactionValues.love,
        reactionValues.laugh,
        reactionValues.sad,
        reactionValues.anger,
      ]

      const resultInsert = await pool.query(queryInsert, valuesInsert)
      res.status(201).json(resultInsert.rows[0])
    } else {
      // If existing reaction, update the count for the corresponding emoji
      const reactionValues = {
        like: existingReaction.rows[0].post_like,
        love: existingReaction.rows[0].post_love,
        laugh: existingReaction.rows[0].post_laugh,
        sad: existingReaction.rows[0].post_sad,
        anger: existingReaction.rows[0].post_anger,
      }

      // Increment the count for the corresponding emoji
      reactionValues[reactionType] += 1

      const queryUpdate =
        `UPDATE post_reactions SET post_like = $1, post_love = $2, post_laugh = $3, post_sad = $4, post_anger = $5 
        WHERE user_post_id = $6 RETURNING *`
      const valuesUpdate = [
        reactionValues.like,
        reactionValues.love,
        reactionValues.laugh,
        reactionValues.sad,
        reactionValues.anger,
        user_post_id,
      ]

      const resultUpdate = await pool.query(queryUpdate, valuesUpdate)
      res.status(200).json(resultUpdate.rows[0])
    }

    // Delete any duplicate rows in post_reactions for user posts
    const queryDeleteDuplicateRows = `
      DELETE FROM post_reactions
      WHERE ctid NOT IN (
        SELECT min(ctid)
        FROM post_reactions
        GROUP BY user_post_id, post_like, post_love, post_laugh, post_sad, post_anger
      )`

    await pool.query(queryDeleteDuplicateRows)
  } catch (error) {
    console.error('Error submitting post', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Post emoji reactions for images in Live Feed
app.post('/SubmitImageReaction', async (req, res) => {
  try {
    const { user_image_id, reactionType } = req.body

    // Check if a row with the same user_image_id exists in the post_reactions table
    const queryCheckExisting =
      'SELECT * FROM image_reactions WHERE user_image_id = $1'
    const valuesCheckExisting = [user_image_id]
    const existingReaction = await pool.query(
      queryCheckExisting,
      valuesCheckExisting
    )

    if (existingReaction.rows.length === 0) {
      // If no existing reaction, insert a new row for the specific post
      const reactionValues = {
        like: 0,
        love: 0,
        laugh: 0,
        sad: 0,
        anger: 0,
      }

      // Increment the count for the corresponding emoji
      reactionValues[reactionType] += 1

      const queryInsert =
        `INSERT INTO image_reactions (user_image_id, post_like, post_love, post_laugh, post_sad, post_anger) 
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`
      const valuesInsert = [
        user_image_id,
        reactionValues.like,
        reactionValues.love,
        reactionValues.laugh,
        reactionValues.sad,
        reactionValues.anger,
      ]

      const resultInsert = await pool.query(queryInsert, valuesInsert)
      res.status(201).json(resultInsert.rows[0])
    } else {
      // If existing reaction, update the count for the corresponding emoji
      const reactionValues = {
        like: existingReaction.rows[0].post_like,
        love: existingReaction.rows[0].post_love,
        laugh: existingReaction.rows[0].post_laugh,
        sad: existingReaction.rows[0].post_sad,
        anger: existingReaction.rows[0].post_anger,
      }

      // Increment the count for the corresponding emoji
      reactionValues[reactionType] += 1

      const queryUpdate =
        'UPDATE image_reactions SET post_like = $1, post_love = $2, post_laugh = $3, post_sad = $4, post_anger = $5 WHERE user_image_id = $6 RETURNING *'
      const valuesUpdate = [
        reactionValues.like,
        reactionValues.love,
        reactionValues.laugh,
        reactionValues.sad,
        reactionValues.anger,
        user_image_id,
      ]

      const resultUpdate = await pool.query(queryUpdate, valuesUpdate)
      res.status(200).json(resultUpdate.rows[0])
    }

    // Delete any duplicate rows in post_reactions
    const queryDeleteDuplicateRows = `
      DELETE FROM image_reactions
      WHERE ctid NOT IN (
        SELECT min(ctid)
        FROM image_reactions
        GROUP BY user_image_id, post_like, post_love, post_laugh, post_sad, post_anger
      )
    `
    await pool.query(queryDeleteDuplicateRows)
  } catch (error) {
    console.error('Error submitting post', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Posts new user poll to Live Feed
app.post('/UserPoll', async (req, res) => {
  try {
    const { pollQuestion, pollOptions, user_id } = req.body
    const query =
      `INSERT INTO user_poll 
      (user_poll_question, user_poll_option_1, user_poll_option_2, user_poll_option_3, user_id, user_post_timestamp) 
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING *`
    const values = [
      pollQuestion,
      pollOptions[0],
      pollOptions[1],
      pollOptions[2],
      user_id,
    ]
    const result = await pool.query(query, values)

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error submitting poll', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Gets poll data for results in Live Feed
app.get('/pollResults', async (req, res) => {
  const { user_poll_id } = req.query
  try {
    const query = `
      SELECT user_poll_result_option_1, user_poll_result_option_2, user_poll_result_option_3
      FROM user_poll_results
      WHERE user_poll_id = $1
    `
    const result = await pool.query(query, [user_poll_id])
    const pollResults = result.rows
    res.status(200).json(pollResults)
  } catch (error) {
    console.error('Error fetching poll results', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Post route for poll vote and user_id to ensure 1 vote only
//Does not currently persist on front end
app.get('/pollResults', async (req, res) => {
  const { user_poll_id, user_id } = req.query
  try {
    const query = `
      SELECT * FROM user_poll_vote where user_poll_id= $1 AND user_id= $2 RETURNING *
    `
    const result = await pool.query(query, [user_poll_id, user_id])
    const userVoted = result.rows.length > 0
    res.status(200).json({ userVoted })
  } catch (error) {
    console.error('Error fetching poll data', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Posts poll vote cast in Live Feed
app.post('/pollResults', async (req, res) => {
  try {
    const { pollResult, user_poll_id, user_id } = req.body
    // Fetch the existing poll results for the given user_poll_id
    const fetchQuery = 'SELECT * FROM user_poll_results WHERE user_poll_id = $1'
    const fetchValues = [user_poll_id]
    const fetchResult = await pool.query(fetchQuery, fetchValues)
    if (fetchResult.rows.length > 0) {
      // If a row exists, get the current poll results
      const currentOptions = fetchResult.rows[0]
      // Update the selected poll option
      const updateQuery =
        `UPDATE user_poll_results SET 
        user_poll_result_option_1 = $1, 
        user_poll_result_option_2 = $2, 
        user_poll_result_option_3 = $3 
        WHERE user_poll_id = $4 RETURNING *`
      const updateValues = [
        currentOptions.user_poll_result_option_1 +
          (pollResult === 'Option 1' ? 1 : 0),
        currentOptions.user_poll_result_option_2 +
          (pollResult === 'Option 2' ? 1 : 0),
        currentOptions.user_poll_result_option_3 +
          (pollResult === 'Option 3' ? 1 : 0),
        user_poll_id,
      ]

      const updateResult = await pool.query(updateQuery, updateValues)
      // Insert the user_poll_id and user_id into user_poll_vote table
      const insertVoteQuery =
        'INSERT INTO user_poll_vote (user_poll_id, user_id) VALUES ($1, $2)'
      const insertVoteValues = [user_poll_id, user_id]
      await pool.query(insertVoteQuery, insertVoteValues)

      res.status(200).json(updateResult.rows[0])
    } else {
      // If a row does not exist, perform an insert with the selected poll option
      const insertQuery =
        `INSERT INTO user_poll_results 
        (user_poll_id, 
        user_poll_result_option_1, 
        user_poll_result_option_2, 
        user_poll_result_option_3) 
        VALUES ($1, $2, $3, $4) RETURNING *`
      const insertValues = [
        user_poll_id,
        pollResult === 'Option 1' ? 1 : 0,
        pollResult === 'Option 2' ? 1 : 0,
        pollResult === 'Option 3' ? 1 : 0,
      ]
      const insertResult = await pool.query(insertQuery, insertValues)
      // Insert the user_poll_id and user_id into user_poll_vote table
      const insertVoteQuery =
        'INSERT INTO user_poll_vote (user_poll_id, user_id) VALUES ($1, $2)'
      const insertVoteValues = [user_poll_id, user_id]
      await pool.query(insertVoteQuery, insertVoteValues)
      res.status(201).json(insertResult.rows[0])
    }
  } catch (error) {
    console.error('Error submitting poll results', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Route to get report categories for dropdown menu in front end
app.get('/reportCategory', async (req, res) => {
  try {
    const query = `
    SELECT * FROM report_category
    `
    const result = await pool.query(query)
    res.status(200).json(result.rows)
  } catch (error) {
    console.error('Error fetching category data', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Post route for report function
app.post('/Report', async (req, res) => {
  try {
    const { reportText, user_id, report_category_id } = req.body
    const query =
      'INSERT INTO report (report_text, user_id, report_category_id) VALUES ($1, $2, $3) RETURNING *'
    const values = [reportText, user_id, report_category_id]
    const result = await pool.query(query, values)

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error submitting report', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Post route for admin only to discussion board
app.post('/DiscussionPost', async (req, res) => {
  try {
    const { discussionText } = req.body
    const query =
      'INSERT INTO discussion_post (discussion_post) VALUES ($1) RETURNING * '
    const values = [discussionText]
    const result = await pool.query(query, values)

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error submitting discussion post', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Gets all discussion posts for discussion feed
app.get('/DiscussionPost', async (req, res) => {
  try {
    const query = `
    SELECT * FROM discussion_post
    `
    const result = await pool.query(query)
    res.status(200).json(result.rows)
  } catch (error) {
    console.error('Error fetching discussion posts', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Renders comments and user profile name on each discussion post
app.get('/DiscussionComments', async (req, res) => {
  const { discussion_post_id } = req.query
  try {
    const query = `
    SELECT discussion_comment.*, user_profile.user_profile_name, user_profile.user_profile_id
    FROM discussion_comment
    JOIN user_credentials ON user_credentials.user_id = discussion_comment.user_id
    JOIN discussion_post ON discussion_post.discussion_post_id = discussion_comment.discussion_post_id
    JOIN user_profile ON user_credentials.user_id = user_profile.user_id
    WHERE discussion_post.discussion_post_id = $1
    ORDER BY discussion_post_id`

    const result = await pool.query(query, [discussion_post_id])
    res.status(200).json(result.rows)
  } catch (error) {
    console.error('Error fetching comments', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Route to post comments to individual discussion posts
app.post('/DiscussionComments', async (req, res) => {
  try {
    const { userComment, discussion_post_id, user_id } = req.body
    const query =
      `INSERT INTO discussion_comment (discussion_comment, discussion_post_id, user_id, post_comment_timestamp) 
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *`
    const values = [userComment, discussion_post_id, user_id]
    const result = await pool.query(query, values)

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error submitting post', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

//Delete discussion comment by user_id
app.post('/DeleteDiscussionComment', async (req, res) => {
  try {
    const { discussion_comment_id } = req.body
    const { user_id } = req.body

    // Delete the comment
    const deleteQuery =
      'DELETE FROM discussion_comment WHERE discussion_comment_id = $1 AND user_id = $2 RETURNING *'
    const deleteResult = await pool.query(deleteQuery, [
      discussion_comment_id,
      user_id,
    ])

    res.status(200).json(deleteResult.rows[0])
  } catch (error) {
    console.error('Error deleting comment', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Handles requests to search for discussion posts based on a search term.
app.get('/DiscussionPostSearch', async (req, res) => {
  try {
    const searchTerm = req.query.searchTerm;
    const query = 
      `SELECT * FROM discussion_post
       WHERE discussion_post ILIKE $1`;
    // Execute the SQL query with the search term as a parameter
    //using parameterised queries to prevent SQL injection.
    const result = await pool.query(query, [`%${searchTerm}%`])

    // Respond with a JSON array of discussion posts that match the search term.
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching discussion posts', error);
    res.status(500).json({ error: 'Internal server error' });
  }
})


//Gets all discussion posts within valid search parameter
app.get('/LiveFeedSearch', async (req, res) => {
  try {
    const searchTerm = req.query.searchTerm
    const query = `
    SELECT *,
    'user_post' AS type
    FROM user_post 
    WHERE user_post ILIKE $1;
    `
    const result = await pool.query(query, [`%${searchTerm}%`])
    res.status(200).json(result.rows)
  } catch (error) {
    console.error('Error fetching matching posts', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})
