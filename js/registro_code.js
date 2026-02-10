// --- Toggle entre Login y Registro ---
if (toggleToRegister) {
    toggleToRegister.addEventListener('click', () => {
        if (loginForm) loginForm.classList.add('hidden');
        if (registerForm) registerForm.classList.remove('hidden');
        if (toggleToRegister) toggleToRegister.classList.add('hidden');
        if (toggleToLogin) toggleToLogin.classList.remove('hidden');
        if (authModeTitle) authModeTitle.textContent = 'Crear Nueva Cuenta';

        hideErrorMessage();
        if (registerErrorMsg) {
            registerErrorMsg.classList.add('hidden');
            registerErrorMsg.textContent = '';
        }

        updateDebugInfo('Modo: Registro de usuario');
    });
}

if (toggleToLogin) {
    toggleToLogin.addEventListener('click', () => {
        if (registerForm) registerForm.classList.add('hidden');
        if (loginForm) loginForm.classList.remove('hidden');
        if (toggleToLogin) toggleToLogin.classList.add('hidden');
        if (toggleToRegister) toggleToRegister.classList.remove('hidden');
        if (authModeTitle) authModeTitle.textContent = 'Acceso de Administrador';

        hideErrorMessage();
        if (registerErrorMsg) {
            registerErrorMsg.classList.add('hidden');
            registerErrorMsg.textContent = '';
        }

        updateDebugInfo('Modo: Inicio de sesión');
    });
}

// --- Registro de Nuevos Usuarios ---
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        updateDebugInfo('Intentando crear nueva cuenta...');

        const email = registerEmailInput.value;
        const password = registerPasswordInput.value;
        const passwordConfirm = registerPasswordConfirmInput.value;

        if (registerErrorMsg) {
            registerErrorMsg.classList.add('hidden');
            registerErrorMsg.textContent = '';
        }

        if (password !== passwordConfirm) {
            if (registerErrorMsg) {
                registerErrorMsg.textContent = '❌ Las contraseñas no coinciden';
                registerErrorMsg.classList.remove('hidden');
            }
            updateDebugInfo('❌ Error: Las contraseñas no coinciden');
            return;
        }

        if (password.length < 6) {
            if (registerErrorMsg) {
                registerErrorMsg.textContent = '❌ La contraseña debe tener al menos 6 caracteres';
                registerErrorMsg.classList.remove('hidden');
            }
            updateDebugInfo('❌ Error: Contraseña muy corta');
            return;
        }

        if (registerBtn) {
            registerBtn.disabled = true;
            registerBtn.textContent = 'Creando cuenta...';
        }

        try {
            updateDebugInfo(`Creando cuenta para: ${email}`);
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            updateDebugInfo('✅ Cuenta creada exitosamente');
            console.log('Usuario creado:', userCredential.user.email);

            registerEmailInput.value = '';
            registerPasswordInput.value = '';
            registerPasswordConfirmInput.value = '';
        } catch (error) {
            console.error("Error al crear cuenta:", error);
            updateDebugInfo(`❌ Error: ${error.code}`);

            let errorMessage = '';
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage = '❌ Este email ya está registrado. Intenta iniciar sesión.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = '❌ Email inválido. Usa formato: usuario@dominio.com';
                    break;
                case 'auth/weak-password':
                    errorMessage = '❌ Contraseña muy débil. Usa al menos 6 caracteres.';
                    break;
                case 'auth/operation-not-allowed':
                    errorMessage = '❌ Registro deshabilitado. Contacta al administrador.';
                    break;
                default:
                    errorMessage = `❌ Error: ${error.message}`;
                    break;
            }

            if (registerErrorMsg) {
                registerErrorMsg.textContent = errorMessage;
                registerErrorMsg.classList.remove('hidden');
            }

            if (registerBtn) {
                registerBtn.disabled = false;
                registerBtn.textContent = 'Crear Cuenta';
            }
        }
    });
}
