const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '.')));
app.use(express.static(path.join(__dirname,)));

// MySQL Connection Pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mathayo77',
    database: 'zahari_medical',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test MySQL Connection
pool.getConnection()
    .then(conn => {
        console.log('Connected to MySQL');
        conn.release();
    })
    .catch(err => console.error('MySQL connection error:', err));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Patient Registration - Updated column names to match your database
app.post('/api/register', async (req, res) => {
    const { firstName, lastName, email, password, dob, phone } = req.body;
    
    try {
        // Check if user already exists
        const [existing] = await pool.execute(
            'SELECT * FROM patients WHERE email = ?', 
            [email]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false,
                message: 'Email already registered' 
            });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Updated to use correct column names (firstName instead of first_name)
        await pool.execute(
            `INSERT INTO patients 
            (first_name, last_name, email, password, dob, phone) 
            VALUES (?, ?, ?, ?, ?, ?)`,
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

// Patient Login - Updated to match column names
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        // Find user by email
        const [users] = await pool.execute(
            'SELECT * FROM patients WHERE email = ?',
            [email]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ 
                success: false,
                message: 'Invalid email or password' 
            });
        }
        
        const user = users[0];
        
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
            'your_jwt_secret',
            { expiresIn: '1h' }
        );
        
        res.json({ 
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                firstName: user.first_name,  // Now matches database
                lastName: user.last_name,   // Now matches database
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
    // Validate admin credentials (store securely in DB in production)
    if (req.body.username === 'admin' && req.body.password === 'securepassword123') {
        const token = jwt.sign({ role: 'admin' }, 'admin-secret-key');
        res.json({ token });
    } else {
        res.status(401).send('Invalid credentials');
    }
});

// Protected admin route
app.get('/admin/appointments', async (req, res) => {
    try {
        const [appointments] = await pool.execute(`
            SELECT a.*, p.name as patient_name 
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            ORDER BY a.appointment_date DESC
            LIMIT 50
        `);
        res.json(appointments);
    } catch (err) {
        res.status(500).send('Database error');
    }
});

// Mpesa setup in server
const { lipaNaMpesaOnline } = require('./js/mpesa');

// Add these routes
app.post('/initiate-mpesa-payment', async (req, res) => {
    try {
        const { phone, amount } = req.body;
        const response = await lipaNaMpesaOnline(phone, amount);
        res.json(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/mpesa-callback', (req, res) => {
    // Handle M-Pesa callback (save to database)
    const paymentData = req.body;
    console.log('Payment callback:', paymentData);
    // TODO: Update payment status in database
    res.status(200).send();
});

// Contact Form Submission
app.post('/submit-contact', async (req, res) => {
    const { name, email, message } = req.body;
    try {
        const [result] = await pool.execute(
            'INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)',
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