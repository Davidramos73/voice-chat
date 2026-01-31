// Login form handler
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        // Clear previous errors
        errorMessage.textContent = '';
        errorMessage.style.display = 'none';

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                // Redirect to chat on success
                window.location.href = '/chat';
            } else {
                const data = await response.json();
                errorMessage.textContent = data.detail || 'Credenciales inválidas';
                errorMessage.style.display = 'block';
            }
        } catch (error) {
            errorMessage.textContent = 'Error de conexión. Intenta nuevamente.';
            errorMessage.style.display = 'block';
        }
    });
});
