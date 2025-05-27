document.addEventListener('DOMContentLoaded', function() {
    // Generate random invoice number
    document.getElementById('invoiceNumber').textContent = Math.floor(1000 + Math.random() * 9000);
    
    // Handle form submission
    document.getElementById('mpesaPaymentForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const phone = document.getElementById('phoneNumber').value;
        const amount = document.getElementById('amount').value;
        const payButton = document.getElementById('payButton');
        
        if (!phone.match(/^254[17]\d{8}$/)) {
            alert('Please enter a valid M-Pesa phone number starting with 254');
            return;
        }
        
        payButton.disabled = true;
        payButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        
        try {
            const response = await fetch('/initiate-mpesa-payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phone, amount })
            });
            
            const result = await response.json();
            
            if (result.ResponseCode === '0') {
                alert('Payment request sent to your phone. Please complete the transaction on your mobile device.');
                // Poll for payment completion (simplified example)
                setTimeout(() => {
                    window.location.href = 'payment-success.html';
                }, 3000);
            } else {
                throw new Error(result.errorMessage || 'Payment failed');
            }
        } catch (err) {
            alert('Error: ' + err.message);
            console.error('Payment error:', err);
        } finally {
            payButton.disabled = false;
            payButton.innerHTML = '<i class="fas fa-mobile-alt"></i> Pay via M-Pesa';
        }
    });
});