const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Read the list of IDs from 'cedulas.txt' file
    const lines = fs.readFileSync('cedulas_v2.txt', 'utf-8').split('\n');
    const cedulas = lines.map((line) => line.trim());

    // Delete the existing 'DATOS_CORVIVIENDA.txt' file if it exists
    if (fs.existsSync('DATOS_CORVIVIENDA.txt')) {
      fs.unlinkSync('DATOS_CORVIVIENDA.txt');
    }

    // Define headers
    const cabeceras = ['CEDULA DE CIUDADANIA', 'SISBEN IV', 'VICTIMA', 'DAMNIFICADO', 'CORVIVIENDA', 'ESTADO'];

    // Write headers to the file with semicolon as a separator
    fs.writeFileSync('DATOS_CORVIVIENDA.txt', `${cabeceras.join(';')}\n`, 'utf-8');

    for (const cedula of cedulas) {
      await page.goto('https://corvivienda.gov.co/app/validador_MiCasaYa/');
      await page.waitForSelector('input[name="buscar"]');

      // Enter the current cedula into the input field with name 'buscar'
      await page.fill('input[name="buscar"]', cedula);

      // Click the search button
      await page.click('button.btn.btn-primary');

      try {
        // Wait for the table to appear within the div with class 'text-center'
        await page.waitForSelector('table.text-center');

        // Extract data from the table
        const rowData = await page.$$eval('table.text-center tbody tr td', (cells) => {
          return cells.map((cell) => cell.textContent.trim());
        });

        // Check if the table contains the expected number of columns
        if (rowData.length === cabeceras.length) {
          fs.appendFileSync('DATOS_CORVIVIENDA.txt', `${rowData.join(';')}\n`, 'utf-8');
        } else {
          console.error(`Invalid data for cedula: ${cedula}`);
        }
      } catch (error) {
        console.error(`Error while scraping cedula: ${cedula}`);
      }
    }
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await browser.close();
  }
})();