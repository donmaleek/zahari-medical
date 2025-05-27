require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const mpesaAuth = async () => {
    const consumer_key = process.env.MPESA_CONSUMER_KEY;
    const consumer_secret = process.env.MPESA_CONSUMER_SECRET;
    const url = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
    
    const buffer = Buffer.from(`${consumer_key}:${consumer_secret}`);
    const auth = `Basic ${buffer.toString('base64')}`;
    
    try {
        const response = await axios.get(url, {
            headers: { Authorization: auth }
        });
        return response.data.access_token;
    } catch (err) {
        console.error('M-Pesa auth error:', err.response?.data || err.message);
        throw err;
    }
};

const lipaNaMpesaOnline = async (phone, amount, callbackUrl) => {
    const token = await mpesaAuth();
    const url = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    const password = Buffer.from(
        `${process.env.MPESA_BUSINESS_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString('base64');
    
    const payload = {
        BusinessShortCode: process.env.MPESA_BUSINESS_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: phone,
        PartyB: process.env.MPESA_BUSINESS_SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: callbackUrl || process.env.MPESA_CALLBACK_URL,
        AccountReference: process.env.MPESA_ACCOUNT_REFERENCE,
        TransactionDesc: 'Payment for medical services'
    };
    
    try {
        const response = await axios.post(url, payload, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (err) {
        console.error('M-Pesa STK push error:', err.response?.data || err.message);
        throw err;
    }
};

module.exports = { lipaNaMpesaOnline };