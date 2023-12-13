const express = require('express');
const http = require('http');
const ejs = require('ejs');
const multer = require('multer');
const fs = require('fs');
const fse = require('fs-extra');
const { chromium } = require('playwright');
const socketIO = require('socket.io');
const { timeStamp, error } = require('console');
const app = express();

//Definimos la ruta del Chrome
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

//Manejador de Error
function logError(err){
    const logFilePath = "errores.log";

    //Fecha actual
    const timestamp = new Date().toISOString();
    const msjError = `${timestamp}: ${err.stack}\n`;

    fs.appendFile(logFilePath,msjError, (errpr) => {
        if(error){
            console.log('Error en Ejecucion',error)
        }
    });

}

//Manejo de errores global
app.use((err, req, res, next) =>{
    logError(err);
    res.status(500).send('Error en el seridor')
})


const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000; // Definir el puerto



// Configuración de EJS como motor de plantillas
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

const filePath = './uploads/archivo.csv';

// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, __dirname + '/uploads');
    },
    filename: (req, file, cb) => {
        cb(null, 'archivo.csv');
    }
});

const upload = multer({ storage: storage });

// Ruta para mostrar el Menu
app.get('/', (req, res) => {
    res.render('index');
});




// Ruta para procesar el archivo para Micasaya
app.post('/micasaya/procesar', upload.single('archivo'), async (req, res) => {
    io.emit('proceso-ini');

    try {
        console.time('procesamiento Cedulas');
        // Establece el nombre del archivo a 'archivo.txt'
        const fileName = 'archivo.csv';
        const filePath = __dirname + '/uploads/' + fileName;

        console.log("cambiando nombre de archivo")
        // Mueve el archivo subido al nuevo nombre
        fs.renameSync(req.file.path, filePath);

        // Lee las cédulas y tipos de documento desde el archivo subido
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        const cedulas = lines.map((line) => {
            const cedula = line.trim();
            return { tipoDocumento:'1', cedula };
        });
        const cantidadFilas = cedulas.length;


        // Inicia una instancia del navegador Playwright
        const browser = await chromium.launch({executablePath:chromePath});
        const page = await browser.newPage();
        console.log("Inicia una instancia del navegador Playwright")

        // Borra el archivo existente 'DATOS_MICASAYA.csv' si existe
        if (fs.existsSync('DATOS_MICASAYA.csv')) {
            fs.unlinkSync('DATOS_MICASAYA.csv');
        }
        console.log("Borrando archivo si existe")


        // Define las cabeceras
        const cabeceras = ['Estado', 'ID del hogar', 'Tipo de documento de identificación', 'Documento de identificación', 'Nombres y apellidos', 'Entidad', 'Fecha de postulación', 'Clasificación de Sisbén IV*', 'Resolución de asignación'];
        console.log(cantidadFilas)

        // Escribe las cabeceras en el archivo con punto y coma como separador
        fs.writeFileSync('DATOS_MICASAYA.csv', `${cabeceras.join(';')}\n`, 'utf-8');
        let datos = 0
        for (const { tipoDocumento, cedula } of cedulas) {
            
            console.log("Iniciando el navegador")
            await page.goto('https://subsidiosfonvivienda.minvivienda.gov.co/micasaya/');
            await page.waitForSelector('select[name="tipo_documento"]');
            await page.selectOption('select[name="tipo_documento"]', tipoDocumento);
            await page.fill('input[name="numero_documento"]', cedula);
            await page.click('.btn-buscar');
            console.log("Buscando usuarios")

            try {
                // Espera a que aparezca la tabla dentro del div con clase 'table-responsive' con un tiempo límite de 30 segundos
                await page.waitForSelector('.table-responsive table', { timeout: 30000 });
                // Busca la información del hogar en la página
                const informacionHogar = await page.$eval('.card-header', (element) => element.textContent.trim());
                // Verifica si la tabla que deseas procesar contiene un encabezado específico
                const tabla = await page.$('.table-responsive table:has-text("ID del hogar")');
                if (tabla) {

                    // Busca la fila que contiene la cédula específica
                    const filaCedula = await tabla.$(`tr:has-text("${cedula}")`);
                    if (filaCedula) {
                        // Procesa la información de la fila encontrada
                        const informacionFila = await filaCedula.$$eval('td', (cells) => {
                            return cells.map((cell) => cell.textContent);
                        });
                        // const textoEtiqueta = await page.$eval('.text-muted', (element) => element.textContent.trim());
                        // const partes = textoEtiqueta.split(':');
                        // const fechaActualizacion = partes[1].trim();

                        const contenidoTextStart = await page.$('.text-start');
                        const contenidoExtra = contenidoTextStart ? await contenidoTextStart.textContent() : '';
                        const resultadoSinTitulo = informacionHogar.replace('Información del hogar:', '').replace('Estado:', '');

                        fs.appendFileSync('DATOS_MICASAYA.csv', `${resultadoSinTitulo.trim()};${informacionFila.join(';')};${contenidoExtra}\n`, 'utf-8');
                    } else {
                        console.error(`No se encontró la cédula: ${cedula}`);
                        // Si no se encuentra la cédula en ninguna fila de la tabla, agrega un mensaje de error
                        fs.appendFileSync('DATOS_MICASAYA.csv', `NO SE ENCONTRÓ REGISTRO, VERIFICA MANUALMENTE;;;${cedula}\n`, 'utf-8');
                    }

                } else {
                    console.error(`No se encontró la tabla para la cédula: ${cedula}`);
                    // Si no se encuentra la tabla, agrega la cédula en el archivo con el mensaje de error
                    fs.appendFileSync('DATOS_MICASAYA.csv', `NO SE ENCONTRÓ REGISTRO, VERIFICA MANUALMENTE;;;${cedula}\n`, 'utf-8');
                }
            } catch (error) {
                // En caso de TimeoutError o cualquier otro error, muestra la cédula y agrega el mensaje de error
                console.error(`Error al consultar la cédula: ${cedula}`);
                fs.appendFileSync('DATOS_MICASAYA.csv', `NO SE ENCONTRÓ REGISTRO, VERIFICA MANUALMENTE;;;${cedula}\n`, 'utf-8');
            }
            datos++;

            // Emitir el progreso para MICASAYA
            const cantCedula = cedulas.length;
            const progress = Math.round((datos / cantCedula) * 100);
            io.emit('micasaya-progress', progress,cantCedula);
        }

        console.log(datos)
        // Cierra el navegador
        await browser.close();

        // Genera un enlace de descarga del archivo procesado
        const fileLink = '/micasaya/descargar';
        res.send(`<div style="margin: 1rem 1rem 1rem 0rem;width: 650px;text-align: center;font-weight: 700;text-transform: uppercase;background-color: #1379cc;padding: 1rem;color: #fff;border-radius: 10px;">
        Archivo procesado correctamente para Micasaya.</div> <a  style="width: 350px;color: #fff;background-color: #31d2f2;border-color: #25cff2;padding: 0.5rem;font-weight: 700;text-transform: uppercase;text-decoration: none;border-radius: 0.5rem;" href="/">PAGINA DE INICIO</a>`);

    } catch (error) {
        logError(error);
        res.status(500).send('Ocurrió un error al procesar el archivo para Micasaya.');
    }
});

// Ruta para descargar el archivo procesado para Micasaya
app.get('/micasaya/descargar', (req, res) => {
    const file = __dirname + '/DATOS_MICASAYA.csv';
    res.download(file, 'DATOS_MICASAYA.csv', (err) => {
        if (err) {
            res.status(500).send('Error al descargar el archivo para Micasaya.');
        } else {
            // Elimina el archivo después de la descarga
            fs.unlinkSync(file);
            // Elimina el archivo 'archivo.csv' después de la descarga
            const archivoTxtPath = __dirname + '/uploads/archivo.csv';
            fs.unlinkSync(archivoTxtPath);

        }
    });
});

// Ruta para procesar el archivo para Corvivienda
app.post('/corvivienda/procesar', upload.single('archivo'), async (req, res) => {
    try {

        // Establece el nombre del archivo a 'archivo.txt'
        const fileName = 'archivo.csv';
        const filePath = __dirname + '/uploads/' + fileName;

        // Mueve el archivo subido al nuevo nombre
        fs.renameSync(req.file.path, filePath);

        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        const cedulas = lines.map((line) => line.trim());


        // Inicia una instancia del navegador Playwright
        const browser = await chromium.launch({executablePath:chromePath});
        const page = await browser.newPage();

        // Borra el archivo existente 'DATOS_CORVIVIENDA.csv' si existe
        if (fs.existsSync('DATOS_CORVIVIENDA.csv')) {
            fs.unlinkSync('DATOS_CORVIVIENDA.csv');
        }

        // Define las cabeceras
        const cabeceras = ['CEDULA DE CIUDADANIA', 'SISBEN IV', 'VICTIMA', 'DAMNIFICADO', 'CORVIVIENDA', 'ESTADO'];

        // Escribe las cabeceras en el archivo con punto y coma como separador
        fs.writeFileSync('DATOS_CORVIVIENDA.csv', `${cabeceras.join(';')}\n`, 'utf-8');
        datos=0;
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
                    fs.appendFileSync('DATOS_CORVIVIENDA.csv', `${rowData.join(';')}\n`, 'utf-8');
                } else {
                    console.error(`Datos inválidos para la cédula: ${cedula}`);
                }
            } catch (error) {

                // Verificar si existe el elemento de error
                const errorDiv = await page.$('.alert.alert-danger');
                if (errorDiv) {
                    let errorText = await errorDiv.textContent();
                    // Reemplazar saltos de línea con espacios en blanco
                    errorText = errorText.replace(/\n/g, ' ');
                    // Si existe, usar el contenido como estado
                    fs.appendFileSync('DATOS_CORVIVIENDA.csv', `${cedula};;;;;${errorText}\n`, 'utf-8');
                } else {
                    res.status(500).send(`Ocurrió un error al procesar cédulas para Corvivienda: ${error.message}`);
                }
            }
            datos++;

            // Emitir el progreso para Corvivienda
            const cantCedula = cedulas.length;
            const progress = Math.round((datos / cantCedula) * 100);
            io.emit('corvivienda-progress', progress,cantCedula);

        }

        // Cierra el navegador
        await browser.close();
        // Genera un enlace de descarga del archivo procesado
        const fileLink = '/corvivienda/descargar';
        res.send(`<div style="margin: 1rem 1rem 1rem 0rem;width: 650px;text-align: center;font-weight: 700;text-transform: uppercase;background-color: #1379cc;padding: 1rem;color: #fff;border-radius: 10px;">
                        Archivo procesado correctamente para Corvivienda.
                </div> 
                <a style="color: #000;background-color: #31d2f2;border-color: #25cff2;padding: 0.5rem;font-weight: 700;text-transform: uppercase;text-decoration: none;border-radius: 0.5rem;" href="/">PAGINA DE INICIO</a>`);
    } catch (error) {
        logError(error);
        res.status(500).send('Ocurrió un error al procesar el archivo para Corvivienda.');
    }
});

// Ruta para descargar el archivo procesado para Corvivienda
app.get('/corvivienda/descargar', (req, res) => {
    const file = __dirname + '/DATOS_CORVIVIENDA.csv';
    res.download(file, 'DATOS_CORVIVIENDA.csv', (err) => {
        if (err) {
            res.status(500).send('Error al descargar el archivo para Corvivienda.');
        } else {
            // Elimina el archivo después de la descarga
            fs.unlinkSync(file);
            // Elimina el archivo 'archivo.txt' después de la descarga
            const archivoTxtPath = __dirname + '/uploads/archivo.csv';
            fs.unlinkSync(archivoTxtPath);

        }
    });
});

// Inicia el servidor
server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});