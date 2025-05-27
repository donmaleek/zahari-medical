async function loadAdminData() {
    const response = await fetch('/admin/appointments', {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
    });
    const data = await response.json();
    
    // Populate appointments table
    const table = document.getElementById('appointmentsTable');
    data.forEach(appt => {
        const row = table.insertRow();
        row.innerHTML = `
            <td>${appt.patient_name}</td>
            <td>${appt.department}</td>
            <td>${new Date(appt.appointment_date).toLocaleString()}</td>
            <td>${appt.status}</td>
        `;
    });
}

// Add admin login functionality
document.getElementById('adminLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const response = await fetch('/admin/login', {
        method: 'POST',
        body: JSON.stringify({
            username: document.getElementById('adminUser').value,
            password: document.getElementById('adminPass').value
        })
    });
    const { token } = await response.json();
    localStorage.setItem('adminToken', token);
    window.location.href = '/admin.html';
});