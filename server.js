const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const nodeXlsx = require('node-xlsx');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs').promises;
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configurar multer
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }
});

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Función para formatear fechas
function formatExcelDate(value) {
    if (!value) return '';
    
    if (value instanceof Date) {
        const day = String(value.getDate()).padStart(2, '0');
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const year = value.getFullYear();
        return `${day}/${month}/${year}`;
    }
    
    if (typeof value === 'number' && value > 0 && value < 100000) {
        const excelEpoch = new Date(1900, 0, 1);
        const adjustedSerial = value > 59 ? value - 2 : value - 1;
        const date = new Date(excelEpoch.getTime() + adjustedSerial * 86400000);
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }
    
    return value.toString();
}

// Función para procesar con Python
async function processWithPython(buffer, password, originalFilename) {
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${originalFilename}`);
    
    try {
        console.log(`💾 Guardando temporal en: ${tempFilePath}`);
        await fs.writeFile(tempFilePath, buffer);
        
        // Comando Python
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const scriptPath = path.join(__dirname, 'decrypt-excel.py');
        
        const command = password 
            ? `${pythonCmd} "${scriptPath}" "${tempFilePath}" "${password}"`
            : `${pythonCmd} "${scriptPath}" "${tempFilePath}"`;
        
        console.log(`🐍 Ejecutando: ${pythonCmd} decrypt-excel.py`);
        
        const { stdout, stderr } = await execPromise(command, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: 30000 // 30 segundos timeout
        });
        
        // Mostrar logs de Python (stderr)
        if (stderr) {
            stderr.split('\n').forEach(line => {
                if (line.trim()) console.log(line);
            });
        }
        
        // Limpiar archivo temporal
        try {
            await fs.unlink(tempFilePath);
            console.log(`🗑️ Temporal eliminado`);
        } catch {}
        
        // Parsear resultado JSON
        const result = JSON.parse(stdout);
        return result;
        
    } catch (error) {
        // Limpiar en caso de error
        try {
            await fs.unlink(tempFilePath);
        } catch {}
        
        // Si es error de ejecución con stderr
        if (error.stderr) {
            console.error('Python stderr:', error.stderr);
        }
        
        throw error;
    }
}

// Endpoint principal
app.post('/api/process-excel', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No se recibió ningún archivo' 
            });
        }

        const password = req.body.password || '';
        const buffer = req.file.buffer;

        console.log('═══════════════════════════════════════');
        console.log(`📄 Archivo: ${req.file.originalname}`);
        console.log(`📦 Tamaño: ${(buffer.length / 1024).toFixed(2)} KB`);
        console.log(`🔐 Contraseña proporcionada: ${password ? `"${password}"` : 'NO'}`);
        
        const signature = buffer.slice(0, 4).toString('hex');
        console.log(`🔍 Signature: ${signature}`);
        
        const isOldFormat = signature === 'd0cf11e0';
        const isNewFormat = signature === '504b0304' || signature === '504b0506';
        
        console.log(`📊 Formato: ${isOldFormat ? 'XLS Antiguo' : isNewFormat ? 'XLSX Moderno' : 'Desconocido'}`);

        let jsonData = [];
        let successMethod = '';

        // ============================================================
        // ESTRATEGIA 1: Si HAY CONTRASEÑA → usar Python SIEMPRE
        // ============================================================
        if (password) {
            try {
                console.log('🐍 ESTRATEGIA 1: Usando Python (contraseña detectada)...');
                const pythonResult = await processWithPython(buffer, password, req.file.originalname);
                
                if (pythonResult.success) {
                    jsonData = pythonResult.data;
                    successMethod = pythonResult.method;
                    console.log(`✅ Python exitoso: ${jsonData.length} filas`);
                } else {
                    // Python reportó error
                    console.log(`❌ Python falló: ${pythonResult.error}`);
                    
                    if (pythonResult.needsPassword) {
                        console.log('═══════════════════════════════════════');
                        return res.status(401).json({
                            success: false,
                            error: 'Contraseña incorrecta',
                            needsPassword: true
                        });
                    }
                    
                    console.log('═══════════════════════════════════════');
                    return res.status(400).json({
                        success: false,
                        error: pythonResult.error
                    });
                }
                
            } catch (pythonError) {
                console.error(`❌ Error ejecutando Python: ${pythonError.message}`);
                
                // Verificar si Python está instalado
                if (pythonError.message.includes('spawn') || pythonError.message.includes('ENOENT')) {
                    console.log('═══════════════════════════════════════');
                    return res.status(500).json({
                        success: false,
                        error: 'Python no está instalado o no está en el PATH del sistema',
                        suggestion: 'Instala Python 3 y las librerías: pip install msoffcrypto-tool openpyxl'
                    });
                }
                
                console.log('═══════════════════════════════════════');
                return res.status(500).json({
                    success: false,
                    error: 'Error procesando con Python: ' + pythonError.message
                });
            }
        }

        // ============================================================
        // ESTRATEGIA 2: XLSX moderno SIN contraseña → ExcelJS
        // ============================================================
        if (jsonData.length === 0 && isNewFormat && !password) {
            try {
                console.log('🔧 ESTRATEGIA 2: ExcelJS (XLSX moderno sin contraseña)...');
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(buffer);
                
                const worksheet = workbook.worksheets[0];
                if (!worksheet) throw new Error('Sin hojas');

                worksheet.eachRow({ includeEmpty: false }, (row) => {
                    const rowData = [];
                    row.eachCell({ includeEmpty: true }, (cell) => {
                        let value = cell.value;
                        if (cell.type === ExcelJS.ValueType.Date) {
                            value = formatExcelDate(value);
                        } else if (cell.type === ExcelJS.ValueType.Formula) {
                            value = cell.result || '';
                        } else if (typeof value === 'object' && value !== null) {
                            if (value.text) value = value.text;
                            else if (value.richText) value = value.richText.map(t => t.text).join('');
                            else value = String(value);
                        }
                        rowData.push(value || '');
                    });
                    jsonData.push(rowData);
                });

                successMethod = 'ExcelJS';
                console.log(`✅ ExcelJS exitoso: ${jsonData.length} filas`);

            } catch (excelJsError) {
                console.log(`⚠️ ExcelJS falló: ${excelJsError.message}`);
            }
        }

        // ============================================================
        // ESTRATEGIA 3: XLS antiguo SIN contraseña → node-xlsx
        // ============================================================
        if (jsonData.length === 0 && isOldFormat && !password) {
            try {
                console.log('🔧 ESTRATEGIA 3: node-xlsx (XLS antiguo sin contraseña)...');
                const sheets = nodeXlsx.parse(buffer);
                
                if (sheets.length > 0) {
                    jsonData = sheets[0].data;
                    successMethod = 'node-xlsx';
                    console.log(`✅ node-xlsx exitoso: ${jsonData.length} filas`);
                }
                
            } catch (nodeXlsxError) {
                console.log(`⚠️ node-xlsx falló: ${nodeXlsxError.message}`);
                
                // Si falla porque tiene contraseña pero no se proporcionó
                if (nodeXlsxError.message.includes('password-protected')) {
                    console.log('═══════════════════════════════════════');
                    return res.status(401).json({
                        success: false,
                        error: 'El archivo está protegido con contraseña. Por favor ingresa la contraseña.',
                        needsPassword: true
                    });
                }
            }
        }

        // ============================================================
        // ESTRATEGIA 4: Último recurso → Python sin contraseña
        // ============================================================
        if (jsonData.length === 0 && !password) {
            try {
                console.log('🐍 ESTRATEGIA 4: Python como último recurso...');
                const pythonResult = await processWithPython(buffer, '', req.file.originalname);
                
                if (pythonResult.success) {
                    jsonData = pythonResult.data;
                    successMethod = pythonResult.method;
                    console.log(`✅ Python exitoso: ${jsonData.length} filas`);
                }
                
            } catch (pythonError) {
                console.log(`⚠️ Python sin contraseña falló: ${pythonError.message}`);
            }
        }

        // ============================================================
        // Si TODO falló
        // ============================================================
        if (jsonData.length === 0) {
            console.log('❌ TODAS las estrategias fallaron');
            console.log('═══════════════════════════════════════');
            
            return res.status(400).json({
                success: false,
                error: 'No se pudo procesar el archivo',
                suggestions: [
                    'Verifica que el archivo no esté corrupto',
                    'Intenta abrirlo en Excel primero',
                    'Guárdalo como .XLSX moderno o .CSV'
                ]
            });
        }

        // ============================================================
        // ÉXITO
        // ============================================================
        console.log(`✅ ÉXITO con: ${successMethod}`);
        console.log(`📊 ${jsonData.length} filas × ${jsonData[0]?.length || 0} cols`);
        console.log('═══════════════════════════════════════');

        res.json({
            success: true,
            data: jsonData,
            info: {
                filename: req.file.originalname,
                rows: jsonData.length,
                cols: jsonData[0]?.length || 0,
                hasPassword: password ? true : false,
                method: successMethod
            }
        });

    } catch (error) {
        console.error('❌ Error general:', error);
        console.log('═══════════════════════════════════════');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint para exportar Excel protegido
app.post('/api/export-excel', express.json({ limit: '50mb' }), async (req, res) => {
    try {
        const { data, password } = req.body;
        
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({
                success: false,
                error: 'No se recibieron datos válidos'
            });
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📊 Exportando Excel: ${data.length} registros`);
        console.log(`🔐 Contraseña: ${password ? `"${password}"` : 'NO'}`);

        const tempDir = os.tmpdir();
        const tempInputPath = path.join(tempDir, `export_${Date.now()}.xlsx`);
        const tempOutputPath = path.join(tempDir, `export_protected_${Date.now()}.xlsx`);

        try {
            // Crear workbook con ExcelJS
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Facturas');

            // Configurar columnas
            worksheet.columns = [
                { header: 'No', key: 'no', width: 8 },
                { header: 'Tipo', key: 'tipo', width: 10 },
                { header: 'Nº Factura', key: 'factura', width: 18 },
                { header: 'N° de referencia', key: 'referencia', width: 20 },
                { header: 'Fecha Factura', key: 'fechaFactura', width: 15 },
                { header: 'Fecha de vencimiento', key: 'fechaVencimiento', width: 20 },
                { header: 'Moneda', key: 'moneda', width: 10 },
                { header: 'Importe Factura', key: 'importe', width: 15 },
                { header: 'Importe de pago', key: 'pago', width: 15 },
                { header: 'Balance', key: 'balance', width: 15 }
            ];

            // Estilo del encabezado
            worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF392677' }
            };
            worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
            worksheet.getRow(1).height = 25;

            // Agregar datos
            data.forEach(record => {
                const row = worksheet.addRow({
                    no: record.no,
                    tipo: record.tipo,
                    factura: record.factura,
                    referencia: record.referencia,
                    fechaFactura: record.fechaFactura,
                    fechaVencimiento: record.fechaVencimiento,
                    moneda: record.moneda,
                    importe: record.importe,
                    pago: record.pago,
                    balance: record.balance
                });

                // Aplicar color según estado
                if (record.fillColor) {
                    row.eachCell((cell) => {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: record.fillColor }
                        };
                    });
                }

                // Bordes
                row.eachCell((cell) => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                    };
                });

                // Alineación
                ['importe', 'pago', 'balance'].forEach(key => {
                    const cell = row.getCell(key);
                    cell.alignment = { horizontal: 'right' };
                });

                ['no', 'tipo', 'moneda', 'fechaFactura', 'fechaVencimiento'].forEach(key => {
                    const cell = row.getCell(key);
                    cell.alignment = { horizontal: 'center' };
                });
            });

            // Agregar leyenda
            const legendRow = worksheet.addRow([]);
            legendRow.height = 5;
            
            const legendTitle = worksheet.addRow(['LEYENDA DE COLORES']);
            legendTitle.font = { bold: true, size: 12 };
            legendTitle.height = 25;
            
            const legend1 = worksheet.addRow(['🔴 Rojo', 'Facturas vencidas']);
            legend1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } };
            
            const legend2 = worksheet.addRow(['⚠️ Amarillo', 'Próximas a vencer (7 días)']);
            legend2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
            
            const legend3 = worksheet.addRow(['✅ Verde', 'Registros acreditados']);
            legend3.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };

            // Guardar archivo temporal
            await workbook.xlsx.writeFile(tempInputPath);
            console.log(`💾 Excel creado: ${tempInputPath}`);

            // Si hay contraseña, proteger con Python
            if (password) {
                const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
                const scriptPath = path.join(__dirname, 'protect-excel.py');
                
                const command = `${pythonCmd} "${scriptPath}" "${tempInputPath}" "${tempOutputPath}" "${password}"`;
                
                console.log(`🔐 Protegiendo con Python...`);
                
                const { stdout, stderr } = await execPromise(command, {
                    maxBuffer: 10 * 1024 * 1024,
                    timeout: 30000
                });
                
                if (stderr) {
                    console.log('Python stderr:', stderr);
                }
                
                const result = JSON.parse(stdout);
                
                if (!result.success) {
                    throw new Error(result.error || 'Error protegiendo archivo');
                }
                
                console.log(`✅ Archivo protegido exitosamente`);
                
                // Leer archivo protegido
                const protectedBuffer = await fs.readFile(tempOutputPath);
                
                // Limpiar archivos temporales
                await fs.unlink(tempInputPath);
                await fs.unlink(tempOutputPath);
                
                console.log(`🗑️ Temporales eliminados`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                
                // Enviar archivo protegido
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="facturas_completas_${new Date().toISOString().split('T')[0]}.xlsx"`);
                res.send(protectedBuffer);
                
            } else {
                // Sin contraseña, enviar directamente
                const buffer = await fs.readFile(tempInputPath);
                await fs.unlink(tempInputPath);
                
                console.log(`✅ Excel sin contraseña generado`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="facturas_completas_${new Date().toISOString().split('T')[0]}.xlsx"`);
                res.send(buffer);
            }

        } catch (innerError) {
            // Limpiar archivos en caso de error
            try {
                await fs.unlink(tempInputPath).catch(() => {});
                await fs.unlink(tempOutputPath).catch(() => {});
            } catch {}
            
            throw innerError;
        }

    } catch (error) {
        console.error('❌ Error en exportación:', error);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString()
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║   🚀 Servidor Iniciado                        ║
║   📡 Puerto: ${PORT}                             ║
║   🌐 http://localhost:${PORT}                    ║
║   ✅ Soporta: XLSX, XLS, CSV + Contraseñas    ║
╚═══════════════════════════════════════════════╝
    `);
});