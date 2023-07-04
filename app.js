//backend server to handle routes and set up database connection
const express = require('express');
const { Pool } = require('pg'); //creates pool of database connections

const app = express(); //instance of express
app.use(express.json()); //middleware function of req/res (use of api)

//connect to postgres database with a new pool (new connection)
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "mslink",
  password: "bed_drift_mild",
  port: 5432,
});

// server port connection 
const port = 3000; 
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

app.post('/SignUp', async (req, res) => {
    try {
      const { userEmail, userPassword } = req.body;
      const query = 'INSERT INTO user_credentials (user_email, user_password) VALUES ($1, $2) RETURNING *';
      const values = [userEmail, userPassword];
      console.log(userEmail, userPassword)
      const result = await pool.query(query, values);
  
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error signing up', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
