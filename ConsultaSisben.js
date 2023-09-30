const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
        // Lee las cédulas y tipos de documento desde el archivo cedulas.txt
        const lines = fs.readFileSync('cedulas.txt', 'utf-8').split('\n');
        const cedulas = lines.map((line) => {
            const [tipoDocumento, cedula] = line.trim().split(';');
            return { tipoDocumento, cedula };
        });

        // Borra el archivo existente 'DATOS_MICASAYA.txt' si existe
        if (fs.existsSync('DATOS_MICASAYA.txt')) {
            fs.unlinkSync('DATOS_MICASAYA.txt');
        }

        // Define las cabeceras
        const cabeceras = ['Nombre', 'Apellidos', 'Tipo de documento', 'Municipio', 'Departamento', 'Grupo de Sisbén IV'];
        // Escribe las cabeceras en el archivo con punto y coma como separador
        fs.writeFileSync('DATOS_MICASAYA.txt', `${cabeceras.join(';')}\n`, 'utf-8');

        for (const { tipoDocumento, cedula } of cedulas) {
            console.log(`Procesando cédula: ${cedula}`);
            await page.goto('https://reportes.sisben.gov.co/dnp_sisbenconsulta');
            console.log('Página cargada correctamente.');
            await page.waitForSelector('select[name="TipoID"]', { timeout: 60000 });
            console.log('Selector de tipo de documento encontrado.');

            // Selecciona el tipo de documento
            await page.selectOption('select[name="TipoID"]', tipoDocumento);
            console.log(`Tipo de documento seleccionado: ${tipoDocumento}`);

            // Ingresa la cédula actual en el campo con name 'documento'
            await page.fill('input[name="documento"]', cedula);
            console.log(`Cédula ingresada: ${cedula}`);

            // Haz clic en el botón con id 'botonenvio'
            await page.click('#botonenvio');
            console.log('Botón de búsqueda clickeado.');

            // Espera un tiempo antes de buscar el contenido en el elemento .contenedor
            await page.waitForTimeout(5000); // Espera 5 segundos (puedes ajustar el tiempo según tus necesidades)
            await page.waitForSelector('.card');

            const contenidoCard = await page.evaluate(() => {
                // Selecciona el div.card y obtén su contenido interno en formato de texto
                const cardElement = document.querySelector('contenedor');
                return cardElement ? cardElement.textContent : 'No se encontró el div.contenedor';
            });

            console.log('Contenido del div.contenedor:', contenidoCard);



            try {
                // Espera a que aparezca la información en el div.card
                await page.waitForSelector('.card', { timeout: 60000 });
                console.log('Información encontrada.');

                // Extrae la información del div.card y escribe en el archivo
                const informacion = await page.$eval('.card', (element) => element.textContent.trim());
                const datos = informacion.split('\n').map((line) => line.trim()).filter((line) => line !== '');

                if (datos.length >= 6) {
                    const [nombre, apellidos, tipoDocumento, municipio, departamento, grupoSisben] = datos;
                    const resultado = [nombre, apellidos, tipoDocumento, municipio, departamento, grupoSisben].join(';');
                    fs.appendFileSync('DATOS_MICASAYA.txt', `${resultado}\n`, 'utf-8');
                    console.log('Información extraída y escrita en el archivo.');
                } else {
                    console.error('No se encontró suficiente información en el div.card.');
                }
            } catch (error) {
                console.error(`Error al obtener información para la cédula: ${cedula}`);
            }
        }
    } catch (error) {
        console.error('Ocurrió un error:', error);
    } finally {
        await browser.close();
    }
})();