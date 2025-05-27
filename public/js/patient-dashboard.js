document.addEventListener('DOMContentLoaded', function() {
    // Load patient data (in a real app, this would come from your backend)
    const patientData = {
        name: "John Doe",
        upcomingAppointments: 2,
        activePrescriptions: 3,
        pendingPayments: 2500,
        lastCheckup: "15 days ago"
    };

    // Populate dashboard with patient data
    document.getElementById('patientName').textContent = patientData.name;
    document.getElementById('upcomingAppointments').textContent = patientData.upcomingAppointments;
    document.getElementById('activePrescriptions').textContent = patientData.activePrescriptions;
    document.getElementById('pendingPayments').textContent = `KES ${patientData.pendingPayments.toLocaleString()}`;
    document.getElementById('lastCheckup').textContent = patientData.lastCheckup;

    // Logout functionality
    document.getElementById('logoutBtn').addEventListener('click', function() {
        // In a real app, you would call your backend logout endpoint
        localStorage.removeItem('patientToken');
        window.location.href = 'index.html';
    });

    // Mobile menu toggle (reuse from main.js if needed)
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const mainNav = document.querySelector('.main-nav');
    
    if (mobileMenuToggle && mainNav) {
        mobileMenuToggle.addEventListener('click', function() {
            mainNav.classList.toggle('active');
            this.innerHTML = mainNav.classList.contains('active') ? 
                '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
        });
    }

    // Check authentication (simplified example)
    if (!localStorage.getItem('patientToken')) {
        window.location.href = 'patient-portal.html';
    }
});