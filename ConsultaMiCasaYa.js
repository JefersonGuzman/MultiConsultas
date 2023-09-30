const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Lee las cédulas y tipos de documento desde el archivo cedulas.txt
    const lines = fs.readFileSync('cedulas_v1.txt', 'utf-8').split('\n');
    const cedulas = lines.map((line) => {
      const [tipoDocumento, cedula] = line.trim().split(';');
      return { tipoDocumento, cedula };
    });

    // Borra el archivo existente 'DATOS_MICASAYA.txt' si existe
    if (fs.existsSync('DATOS_MICASAYA.txt')) {
      fs.unlinkSync('DATOS_MICASAYA.txt');
    }

    // Define las cabeceras
    const cabeceras = ['Estado', 'ID del hogar', 'Tipo de documento de identificación', 'Documento de identificación', 'Nombres y apellidos', 'Entidad', 'Fecha de postulación', 'Clasificación de Sisbén IV*', 'Resolución de asignación'];

    // Escribe las cabeceras en el archivo con punto y coma como separador
    fs.writeFileSync('DATOS_MICASAYA.txt', `${cabeceras.join(';')}\n`, 'utf-8');

    for (const { tipoDocumento, cedula } of cedulas) {
      await page.goto('https://subsidiosfonvivienda.minvivienda.gov.co/micasaya/');
      await page.waitForSelector('select[name="tipo_documento"]');

      // Selecciona el tipo de documento
      await page.selectOption('select[name="tipo_documento"]', tipoDocumento);

      // Ingresa la cédula actual en el campo con name 'numero_documento'
      await page.fill('input[name="numero_documento"]', cedula);

      // Haz clic en el botón con clase 'btn-buscar'
      await page.click('.btn-buscar');
      try {
        // Espera a que aparezca la tabla dentro del div con clase 'table-responsive' con un tiempo límite de 30 segundos
        await page.waitForSelector('.table-responsive table', { timeout: 30000 });
        // Busca la información del hogar en la página
        const informacionHogar = await page.$eval('.card-header', (element) => element.textContent.trim());
        // Verifica si la tabla que deseas procesar contiene un encabezado específico
        const tabla = await page.$('.table-responsive table:has-text("ID del hogar")');
        if (tabla) {
          // Obtiene las filas (tr) de la tabla
          const filasDeTabla = await tabla.$$eval('tr', (rows) => {
            return rows.map((row) => {
              return Array.from(row.querySelectorAll('td'), (cell) => cell.textContent).join(';');
            });
          });
          // Busca la clase 'text-start' en la página
          const contenidoTextStart = await page.$('.text-start');
          // Si existe la clase 'text-start', obtén su contenido
          const contenidoExtra = contenidoTextStart ? await contenidoTextStart.textContent() : '';
          const resultadoSinTitulo = informacionHogar.replace('Información del hogar:', '').replace('Estado:', '');
          fs.appendFileSync('DATOS_MICASAYA.txt', `${resultadoSinTitulo.trim()};${filasDeTabla.join(';')};${contenidoExtra}\n`, 'utf-8');
        } else {
          console.error(`No se encontró la tabla para la cédula: ${cedula}`);
        }
      } catch (error) {
        // En caso de TimeoutError, muestra la cédula y continúa con el proceso
        console.error(`Timeout al consultar la cédula: ${cedula}`);
      }
    }
  } catch (error) {
    console.error('Ocurrió un error:', error);
  } finally {
    await browser.close();
  }
})();