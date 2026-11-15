// Clock Module for Mi Bodega Digital
// Displays real-time date and time in header

/** "DD/MM/YYYY" y "HH:MM:SS" en la hora del navegador (igual que la v5.3). */
export function formatearReloj(now: Date): { fecha: string; hora: string } {
  const dos = (n: number) => String(n).padStart(2, '0');
  return {
    fecha: `${dos(now.getDate())}/${dos(now.getMonth() + 1)}/${now.getFullYear()}`,
    hora: `${dos(now.getHours())}:${dos(now.getMinutes())}:${dos(now.getSeconds())}`,
  };
}

export function initClock(): void {
  const dateElement = document.getElementById('current-date');
  const timeElement = document.getElementById('current-time');
  if (!dateElement || !timeElement) return;

  const updateClock = () => {
    const { fecha, hora } = formatearReloj(new Date());
    dateElement.textContent = fecha;
    timeElement.textContent = hora;
  };

  updateClock();
  setInterval(updateClock, 1000);
}
