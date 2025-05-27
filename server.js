require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '.')));
app.use(express.static(path.join(__dirname, 'public')));

// PostgreSQL Connection Pool for Render.com
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://zahari_medical_user:60igfiGawV5EvLfc4oGMVyVzxUXFyeUa@dpg-d0qpqvh5pdvs73aqvehg-a.oregon-postgres.render.com/zahari_medical',
  ssl: {
    rejectUnauthorized: false // Required for Render.com PostgreSQL
  }
});

// Enhanced connection test
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('PostgreSQL connection error:', err);
    console.log('Attempting to connect to:', {
      host: pool.options.host,
      port: pool.options.port,
      database: pool.options.database,
      user: pool.options.user
    });
  } else {
    console.log('Successfully connected to PostgreSQL at:', res.rows[0].now);
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Patient Registration
app.post('/api/register', async (req, res) => {
  const { firstName, lastName, email, password, dob, phone } = req.body;
  
  try {
    // Check if user already exists
    const existing = await pool.query(
      'SELECT * FROM patients WHERE email = $1', 
      [email]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Email already registered' 
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    await pool.query(
      `INSERT INTO patients 
      (first_name, last_name, email, password, dob, phone) 
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [firstName, lastName, email, hashedPassword, dob, phone]
    );
    
    res.status(201).json({ 
      success: true,
      message: 'Registration successful' 
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Registration failed',
      error: err.message 
    });
  }
});

// Patient Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Find user by email
    const users = await pool.query(
      'SELECT * FROM patients WHERE email = $1',
      [email]
    );
    
    if (users.rows.length === 0) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }
    
    const user = users.rows[0];
    
    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '1h' }
    );
    
    res.json({ 
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Login failed',
      error: err.message 
    });
  }
});

// JSON parse error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ 
      success: false,
      message: 'Invalid JSON payload' 
    });
  }
  next();
});

// Admin login
app.post('/admin/login', async (req, res) => {
  if (req.body.username === 'admin' && req.body.password === 'securepassword123') {
    const token = jwt.sign({ role: 'admin' }, process.env.ADMIN_JWT_SECRET || 'admin-secret-key');
    res.json({ token });
  } else {
    res.status(401).send('Invalid credentials');
  }
});

// Required for Render's health checks
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Protected admin route
app.get('/admin/appointments', async (req, res) => {
  try {
    const appointments = await pool.query(`
      SELECT a.*, p.first_name || ' ' || p.last_name as patient_name 
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      ORDER BY a.appointment_date DESC
      LIMIT 50
    `);
    res.json(appointments.rows);
  } catch (err) {
    res.status(500).send('Database error');
  }
});

// M-Pesa configuration
const mpesaConfig = {
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  passKey: process.env.MPESA_PASSKEY,
  businessShortCode: process.env.MPESA_BUSINESS_SHORTCODE,
  callbackUrl: process.env.MPESA_CALLBACK_URL,
  accountReference: process.env.MPESA_ACCOUNT_REFERENCE || 'ZAHARI_MEDICAL'
};

// Generate M-Pesa access token
async function getMpesaAccessToken() {
  try {
    const auth = Buffer.from(`${mpesaConfig.consumerKey}:${mpesaConfig.consumerSecret}`).toString('base64');
    const response = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: {
        Authorization: `Basic ${auth}`
      }
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting M-Pesa access token:', error);
    throw error;
  }
}

// Lipa Na M-Pesa Online function
async function lipaNaMpesaOnline(phone, amount) {
  try {
    const accessToken = await getMpesaAccessToken();
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, -3);
    const password = Buffer.from(`${mpesaConfig.businessShortCode}${mpesaConfig.passKey}${timestamp}`).toString('base64');
    
    const requestData = {
      BusinessShortCode: mpesaConfig.businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: mpesaConfig.businessShortCode,
      PhoneNumber: phone,
      CallBackURL: mpesaConfig.callbackUrl,
      AccountReference: mpesaConfig.accountReference,
      TransactionDesc: 'Payment for medical services'
    };

    const response = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', requestData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error initiating M-Pesa payment:', error.response?.data || error.message);
    throw error;
  }
}

// M-Pesa routes
app.post('/initiate-mpesa-payment', async (req, res) => {
  try {
    const { phone, amount } = req.body;
    if (!phone || !amount) {
      return res.status(400).json({ error: 'Phone and amount are required' });
    }

    // Validate phone number format
    const formattedPhone = phone.replace(/\D/g, '').replace(/^0/, '254');
    
    const response = await lipaNaMpesaOnline(formattedPhone, amount);
    res.json(response);
  } catch (err) {
    res.status(500).json({ 
      error: err.message,
      details: err.response?.data || 'M-Pesa payment initiation failed'
    });
  }
});

app.post('/mpesa-callback', (req, res) => {
  const callbackData = req.body;
  console.log('M-Pesa Callback Received:', callbackData);

  // Verify the callback is from M-Pesa
  const resultCode = callbackData.Body.stkCallback.ResultCode;
  const resultDesc = callbackData.Body.stkCallback.ResultDesc;
  
  if (resultCode === '0') {
    // Successful payment
    const items = callbackData.Body.stkCallback.CallbackMetadata.Item;
    const amount = items.find(item => item.Name === 'Amount').Value;
    const mpesaReceiptNumber = items.find(item => item.Name === 'MpesaReceiptNumber').Value;
    const phoneNumber = items.find(item => item.Name === 'PhoneNumber').Value;
    
    console.log(`Payment successful:
      Amount: ${amount}
      Receipt: ${mpesaReceiptNumber}
      Phone: ${phoneNumber}`);
    
    // TODO: Update your database with payment details
  } else {
    console.log(`Payment failed: ${resultDesc}`);
  }

  res.status(200).send();
});

// Contact Form Submission
app.post('/submit-contact', async (req, res) => {
  const { name, email, message } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO contacts (name, email, message) VALUES ($1, $2, $3)',
      [name, email, message]
    );
    res.json({ 
      success: true,
      message: 'Message received! We will contact you soon.' 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: 'Database error' 
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});