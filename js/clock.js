// Clock Module for Mi Bodega Digital
// Displays real-time date and time in header

export function initClock() {
    const dateElement = document.getElementById('current-date');
    const timeElement = document.getElementById('current-time');

    if (!dateElement || !timeElement) return;

    function updateClock() {
        const now = new Date();

        // Format date: DD/MM/YYYY
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const dateString = `${day}/${month}/${year}`;

        // Format time: HH:MM:SS
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timeString = `${hours}:${minutes}:${seconds}`;

        // Update DOM
        dateElement.textContent = dateString;
        timeElement.textContent = timeString;
    }

    // Initial update
    updateClock();

    // Update every second
    setInterval(updateClock, 1000);
}
