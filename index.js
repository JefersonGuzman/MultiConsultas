const express = require('express');
const ejs = require('ejs');
const multer = require('multer');
const fs = require('fs');
const fse = require('fs-extra'); 

const { chromium } = require('playwright');


const app = express();
const port = process.env.PORT || 3000;


// Configuración de EJS como motor de plantillas
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');


const filePath = './uploads/archivo.txt';


// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, __dirname + '/uploads');
    },
    filename: (req, file, cb) => {
        cb(null, 'archivo.txt'); 
    }
});

try {
    fs.chmodSync(filePath, '0666');
    console.log('Se han concedido permisos de escritura al archivo.');
  } catch (error) {
    console.error('Error al conceder permisos de escritura:', error);
  }

  
const upload = multer({ storage: storage });

// Ruta para mostrar el formulario para Micasaya
app.get('/', (req, res) => {
    res.render('index');
});



// Ruta para mostrar el formulario para Micasaya
app.get('/micasaya', (req, res) => {
    res.render('micasaya');
});

// Ruta para procesar el archivo para Micasaya
app.post('/micasaya/procesar', upload.single('archivo'), async (req, res) => {
    try {

        // Establece el nombre del archivo a 'archivo.txt'
        const fileName = 'archivo.txt';
        const filePath = __dirname + '/uploads/' + fileName;

        // Mueve el archivo subido al nuevo nombre
        fs.renameSync(req.file.path, filePath);

        // Lee las cédulas y tipos de documento desde el archivo subido
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        const cedulas = lines.map((line) => {
            const [tipoDocumento, cedula] = line.trim().split(';');
            return { tipoDocumento, cedula };
        });

        // Inicia una instancia del navegador Playwright
        const browser = await chromium.launch();
        const page = await browser.newPage();

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
            await page.selectOption('select[name="tipo_documento"]', tipoDocumento);
            await page.fill('input[name="numero_documento"]', cedula);
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
                    // Si no se encuentra la tabla, agrega la cédula en el archivo con el mensaje de error
                    fs.appendFileSync('DATOS_MICASAYA.txt', `NO SE ENCONTRÓ REGISTRO, VERIFICA MANUALMENTE;;${cedula}\n`, 'utf-8');
                }
            } catch (error) {
                // En caso de TimeoutError o cualquier otro error, muestra la cédula y agrega el mensaje de error
                console.error(`Error al consultar la cédula: ${cedula}`);
                fs.appendFileSync('DATOS_MICASAYA.txt', `NO SE ENCONTRÓ REGISTRO, VERIFICA MANUALMENTE;;${cedula}\n`, 'utf-8');
            }
        }

        // Cierra el navegador
        await browser.close();



        // Genera un enlace de descarga del archivo procesado
        const fileLink = '/micasaya/descargar';
        res.send(`Archivo procesado correctamente para Micasaya. <a href="${fileLink}" download>Descargar archivo</a>`);
    } catch (error) {
        res.status(500).send('Ocurrió un error al procesar el archivo para Micasaya.');
    }
});

// Ruta para descargar el archivo procesado para Micasaya
app.get('/micasaya/descargar', (req, res) => {
    const file = __dirname + '/DATOS_MICASAYA.txt';
    res.download(file, 'DATOS_MICASAYA.txt', (err) => {
        if (err) {
            res.status(500).send('Error al descargar el archivo para Micasaya.');
        } else {
            // Elimina el archivo después de la descarga
            fs.unlinkSync(file);
            // Elimina el archivo 'archivo.txt' después de la descarga
            const archivoTxtPath = __dirname + '/uploads/archivo.txt';
            fs.unlinkSync(archivoTxtPath);

        }
    });
});

// Ruta para mostrar el formulario para Corvivienda
app.get('/corvivienda', (req, res) => {
    res.render('corvivienda');
});

// Ruta para procesar el archivo para Corvivienda
app.post('/corvivienda/procesar', upload.single('archivo'), async (req, res) => {
    try {


        // Establece el nombre del archivo a 'archivo.txt'
        const fileName = 'archivo.txt';
        const filePath = __dirname + '/uploads/' + fileName;

        // Mueve el archivo subido al nuevo nombre
        fs.renameSync(req.file.path, filePath);

        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        const cedulas = lines.map((line) => line.trim());

        // Inicia una instancia del navegador Playwright
        const browser = await chromium.launch();
        const page = await browser.newPage();

        // Borra el archivo existente 'DATOS_CORVIVIENDA.txt' si existe
        if (fs.existsSync('DATOS_CORVIVIENDA.txt')) {
            fs.unlinkSync('DATOS_CORVIVIENDA.txt');
        }

        // Define las cabeceras
        const cabeceras = ['CEDULA DE CIUDADANIA', 'SISBEN IV', 'VICTIMA', 'DAMNIFICADO', 'CORVIVIENDA', 'ESTADO'];

        // Escribe las cabeceras en el archivo con punto y coma como separador
        fs.writeFileSync('DATOS_CORVIVIENDA.txt', `${cabeceras.join(';')}\n`, 'utf-8');

        for (const cedula of cedulas) {
            await page.goto('https://corvivienda.gov.co/app/validador_MiCasaYa/');
            await page.waitForSelector('input[name="buscar"]');

            // Ingresa la cédula actual en el campo con name 'buscar'
            await page.fill('input[name="buscar"]', cedula);

            // Haz clic en el botón
            await page.click('button.btn.btn-primary');

            try {
                // Espera a que aparezca la tabla
                const tabla = await page.waitForSelector('table.text-center', { timeout: 5000 });

                // Extrae datos de la tabla
                const rowData = await tabla.$$eval('tbody tr td', (cells) => {
                    return cells.map((cell) => cell.textContent.trim());
                });

                // Verifica si la tabla contiene el número esperado de columnas
                if (rowData.length === cabeceras.length) {
                    fs.appendFileSync('DATOS_CORVIVIENDA.txt', `${rowData.join(';')}\n`, 'utf-8');
                } else {
                    console.error(`Datos inválidos para la cédula: ${cedula}`);
                }
            } catch (error) {
                console.error(`Error al obtener información para la cédula: ${cedula}`);

                // Verificar si existe el elemento de error
                const errorDiv = await page.$('.alert.alert-danger');
                if (errorDiv) {
                    let errorText = await errorDiv.textContent();
                    // Reemplazar saltos de línea con espacios en blanco
                    errorText = errorText.replace(/\n/g, ' ');
                    // Si existe, usar el contenido como estado
                    fs.appendFileSync('DATOS_CORVIVIENDA.txt', `${cedula};;;;;${errorText}\n`, 'utf-8');
                } else {
                    res.status(500).send(`Ocurrió un error al procesar cédulas para Corvivienda: ${error.message}`);
                }
            }
        }

        // Cierra el navegador
        await browser.close();


        // Genera un enlace de descarga del archivo procesado
        const fileLink = '/corvivienda/descargar';
        res.send(`Archivo procesado correctamente para Corvivienda. <a href="${fileLink}" download>Descargar archivo</a>`);
    } catch (error) {
        res.status(500).send('Ocurrió un error al procesar el archivo para Corvivienda.');
    }
});

// Ruta para descargar el archivo procesado para Corvivienda
app.get('/corvivienda/descargar', (req, res) => {
    const file = __dirname + '/DATOS_CORVIVIENDA.txt';
    res.download(file, 'DATOS_CORVIVIENDA.txt', (err) => {
        if (err) {
            res.status(500).send('Error al descargar el archivo para Corvivienda.');
        } else {
            // Elimina el archivo después de la descarga
            fs.unlinkSync(file);
            // Elimina el archivo 'archivo.txt' después de la descarga
            const archivoTxtPath = __dirname + '/uploads/archivo.txt';
            fs.unlinkSync(archivoTxtPath);

        }
    });
});



app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});