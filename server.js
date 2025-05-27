require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://zahari_medical_user:60igfiGawV5EvLfc4oGMVyVzxUXFyeUa@dpg-d0qpqvh5pdvs73aqvehg-a.oregon-postgres.render.com/zahari_medical',
  ssl: {
    rejectUnauthorized: false
  }
});

// Test Database Connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error acquiring client', err.stack);
  } else {
    console.log('Successfully connected to PostgreSQL database');
    release();
  }
});

// Health Check Endpoint (Required for Render)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// Main Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Patient Registration
app.post('/api/register', async (req, res) => {
  const { firstName, lastName, email, password, dob, phone } = req.body;
  
  try {
    // Check if user exists
    const userExists = await pool.query('SELECT * FROM patients WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert new user
    const newUser = await pool.query(
      `INSERT INTO patients (first_name, last_name, email, password, dob, phone) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [firstName, lastName, email, hashedPassword, dob, phone]
    );

    res.status(201).json({
      success: true,
      user: {
        id: newUser.rows[0].id,
        firstName: newUser.rows[0].first_name,
        lastName: newUser.rows[0].last_name,
        email: newUser.rows[0].email
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Patient Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user
    const user = await pool.query('SELECT * FROM patients WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.rows[0].password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create JWT token
    const token = jwt.sign(
      { id: user.rows[0].id, email: user.rows[0].email },
      process.env.JWT_SECRET || 'your_jwt_secret_here',
      { expiresIn: '1h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.rows[0].id,
        firstName: user.rows[0].first_name,
        lastName: user.rows[0].last_name,
        email: user.rows[0].email
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Admin Routes
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === 'admin' && password === 'securepassword123') {
    const token = jwt.sign(
      { role: 'admin' }, 
      process.env.ADMIN_JWT_SECRET || 'admin_secret_here',
      { expiresIn: '1h' }
    );
    return res.json({ token });
  }
  
  res.status(401).json({ error: 'Invalid credentials' });
});

// M-Pesa Payment Integration
const mpesaConfig = {
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  passKey: process.env.MPESA_PASSKEY,
  businessShortCode: process.env.MPESA_BUSINESS_SHORTCODE,
  callbackUrl: process.env.MPESA_CALLBACK_URL || 'https://yourdomain.com/mpesa-callback',
  accountReference: process.env.MPESA_ACCOUNT_REFERENCE || 'ZAHARI_MEDICAL'
};

app.post('/initiate-payment', async (req, res) => {
  try {
    const { phone, amount } = req.body;
    const formattedPhone = `254${phone.substring(phone.length - 9)}`;
    
    const token = await getMpesaToken();
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
    const password = Buffer.from(`${mpesaConfig.businessShortCode}${mpesaConfig.passKey}${timestamp}`).toString('base64');

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: mpesaConfig.businessShortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: formattedPhone,
        PartyB: mpesaConfig.businessShortCode,
        PhoneNumber: formattedPhone,
        CallBackURL: mpesaConfig.callbackUrl,
        AccountReference: mpesaConfig.accountReference,
        TransactionDesc: 'Medical Services Payment'
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Payment error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

async function getMpesaToken() {
  const auth = Buffer.from(`${mpesaConfig.consumerKey}:${mpesaConfig.consumerSecret}`).toString('base64');
  const response = await axios.get(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return response.data.access_token;
}

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});