let allData = {
    servicios: [],
    stockcomp: [],
    stocknum: [],
    otros: []
};

let filteredData = {
    servicios: [],
    stockcomp: [],
    stocknum: [],
    otros: []
};

let groupingOptions = {
    servicios: 'none',
    stockcomp: 'none',
    stocknum: 'none',
    otros: 'none'
};

let sortingOptions = {
    servicios: 'due-asc',
    stockcomp: 'due-asc',
    stocknum: 'due-asc',
    otros: 'due-asc'
};
let currentEditingId = null;
let currentCategory = 'servicios';
let currentAddCategory = 'servicios';
let needsPassword = false;

const fileInput = document.getElementById('fileInput');
const passwordInput = document.getElementById('passwordInput');
const processButton = document.getElementById('processButton');
const dataSection = document.getElementById('dataSection');
const status = document.getElementById('status');
const fileName = document.getElementById('fileName');

// Configuración de la API
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : window.location.origin;

console.log('🌐 API URL:', API_URL);

// Event listeners para las pestañas
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
        const category = this.dataset.category;
        switchTab(category);
    });
});

// Event listeners para controles de agrupamiento
['servicios', 'stockcomp', 'stocknum', 'otros'].forEach(category => {
    const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
    const groupSelect = document.getElementById(`groupBy${capitalizedCategory}`);
    const sortSelect = document.getElementById(`sortBy${capitalizedCategory}`);
    
    if (groupSelect) {
        groupSelect.addEventListener('change', (e) => {
            groupingOptions[category] = e.target.value;
            renderTable(category);
        });
    }
    
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            sortingOptions[category] = e.target.value;
            renderTable(category);
        });
    }
});

// Event listeners para cada categoría
['servicios', 'stockcomp', 'stocknum', 'otros'].forEach(category => {
    const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
    const searchInput = document.getElementById(`searchInput${capitalizedCategory}`);
    const saveButton = document.getElementById(`saveButton${capitalizedCategory}`);
    const addButton = document.getElementById(`addButton${capitalizedCategory}`);
    
    if (searchInput) searchInput.addEventListener('input', () => filterData(category));
    if (addButton) addButton.addEventListener('click', () => addNewRecord(category));
});

fileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const fileSize = (file.size / 1024 / 1024).toFixed(2);
        fileName.textContent = `📄 ${file.name} (${fileSize} MB)`;
        processButton.disabled = false;
    }
});

processButton.addEventListener('click', processFile);

function switchTab(category) {
    // Cambiar pestañas activas
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    const targetTab = document.querySelector(`[data-category="${category}"]`);
    if (targetTab) targetTab.classList.add('active');

    // Cambiar contenido activo
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    const targetContent = document.getElementById(category);
    if (targetContent) targetContent.classList.add('active');

    currentCategory = category;
    renderTable(category);
}

function categorizeRecord(referencia) {
    if (!referencia) return 'otros';
    const ref = referencia.toUpperCase().trim();
    
    // Servicios: RNN
    if (ref.startsWith('RNN')) return 'servicios';
    
    // StockComp: STOCKCOMP
    if (ref.startsWith('STOCKCOMP')) return 'stockcomp';
    
    // Stock con número: STOCK seguido de números (STOCK1, STOCK2, etc)
    if (/^STOCK\d+/.test(ref)) return 'stocknum';
    
    // Todo lo demás (incluyendo ESIN que antes era créditos)
    return 'otros';
}

async function processFile() {
    const file = fileInput.files[0];
    const password = passwordInput.value.trim();

    if (!file) {
        showStatus('Por favor selecciona un archivo', 'error');
        return;
    }

    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.split('.').pop();

    showStatus('📤 Enviando archivo al servidor...', 'loading');
    processButton.disabled = true;

    try {
        let jsonData;

        if (fileExtension === 'csv') {
            // Procesar CSV localmente (no necesita servidor)
            const text = await file.text();
            const parsed = Papa.parse(text, {
                skipEmptyLines: true,
                encoding: 'UTF-8'
            });
            jsonData = parsed.data;
            showStatus('✅ CSV procesado localmente', 'success');
            
        } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
            // Enviar al servidor para procesamiento
            const formData = new FormData();
            formData.append('file', file);
            formData.append('password', password);

            try {
                const response = await fetch(`${API_URL}/api/process-excel`, {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (!response.ok) {
                    if (result.needsPassword) {
                        showStatus('🔒 Contraseña incorrecta. Por favor verifica e intenta nuevamente.', 'error');
                        processButton.disabled = false;
                        passwordInput.focus();
                        passwordInput.select();
                        return;
                    }
                    
                    if (result.needsAlternative) {
                        // Mostrar métodos alternativos
                        showAlternativeMethods(result.alternatives);
                        processButton.disabled = false;
                        return;
                    }

                    throw new Error(result.error || 'Error procesando el archivo');
                }

                jsonData = result.data;
                
                const infoMsg = result.info.hasPassword 
                    ? `✅ Archivo desencriptado: ${result.info.rows} filas, ${result.info.cols} columnas`
                    : `✅ Archivo procesado: ${result.info.rows} filas, ${result.info.cols} columnas`;
                
                showStatus(infoMsg, 'success');
                
            } catch (fetchError) {
                if (fetchError.message.includes('Failed to fetch')) {
                    showStatus('❌ No se puede conectar al servidor. Verifica que esté ejecutándose.', 'error');
                } else {
                    showStatus('❌ ' + fetchError.message, 'error');
                }
                processButton.disabled = false;
                return;
            }
            
        } else {
            throw new Error('Formato no soportado. Use .xlsx, .xls o .csv');
        }

        // Procesar los datos
        const success = await processNewRecords(jsonData);
        if (!success) {
            processButton.disabled = false;
            return;
        }

        // Limpiar contraseña si fue exitoso
        if (password) {
            passwordInput.value = '';
        }

    } catch (error) {
        console.error('Error:', error);
        showStatus('❌ Error: ' + error.message, 'error');
        processButton.disabled = false;
    }
}

// FIXED: Simplified and robust date parser
function formatDate(dateStr) {
    if (!dateStr || dateStr === '') return '';

    // If already in DD/MM/YYYY format (string)
    if (typeof dateStr === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split('/');
        const testDate = new Date(Number(year), Number(month) - 1, Number(day));
        if (!isNaN(testDate.getTime()) && testDate.getFullYear() == year) {
            return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
        }
    }

    // Handle Excel serial numbers
    if (!isNaN(dateStr) && typeof dateStr !== 'object') {
        const serialNumber = Number(dateStr);
        
        if (serialNumber > 0 && serialNumber < 100000) {
            const excelEpoch = new Date(1900, 0, 1);
            const adjustedSerial = serialNumber > 59 ? serialNumber - 2 : serialNumber - 1;
            const date = new Date(excelEpoch.getTime() + adjustedSerial * 86400000);
            
            if (!isNaN(date.getTime())) {
                const day = date.getDate().toString().padStart(2, '0');
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const year = date.getFullYear();
                return `${day}/${month}/${year}`;
            }
        }
    }

    // Handle Date objects
    if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
        const day = dateStr.getDate().toString().padStart(2, '0');
        const month = (dateStr.getMonth() + 1).toString().padStart(2, '0');
        const year = dateStr.getFullYear();
        return `${day}/${month}/${year}`;
    }

    // Handle ISO format (YYYY-MM-DD)
    if (typeof dateStr === 'string' && /^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-');
        const testDate = new Date(Number(year), Number(month) - 1, Number(day));
        if (!isNaN(testDate.getTime())) {
            return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
        }
    }

    return '';
}

async function processNewRecords(jsonData) {
    const fileId = `file_${Date.now()}`;
    const fileName = fileInput.files[0]?.name || 'archivo_desconocido.xlsx';
    // Procesar los datos del archivo
    const dataRows = jsonData.length > 1 ? jsonData.slice(1) : jsonData;
    const newRecordsFromFile = dataRows.map((row, index) => ({
        id: index,
        no: (row[0] || index + 1).toString(),
        tipo: (row[1] || '').toString(),
        factura: (row[2] || '').toString(),
        referencia: (row[3] || '').toString(),
        fechaFactura: formatDate(row[4] || ''),
        fechaVencimiento: formatDate(row[5] || ''),
        moneda: (row[6] || 'MXN').toString(),
        importe: (row[7] || '0').toString(),
        pago: (row[8] || '0').toString(),
        balance: (row[9] || '0').toString(),
        color: 'none',
        quien: '',
        pendiente: (row[9] || '0').toString(),
        sourceFile: fileName,
        sourceFileId: fileId,
        importDate: new Date().toISOString()
    }));

    // Verificar si ya hay datos existentes
    const hasExistingData = Object.values(allData).some(arr => arr.length > 0);

    if (hasExistingData) {
        // CASO: Ya hay datos, comparar y agregar solo nuevos
        const newRecords = getNewRecords(allData, newRecordsFromFile);

        if (newRecords.length === 0) {
            showStatus('ℹ️ No se encontraron registros nuevos. Todos los registros ya existen en el sistema.', 'success');
            return false;
        }

        const shouldAdd = await showPreviewModal(newRecords);

        if (!shouldAdd) {
            showStatus('❌ Operación cancelada. No se agregaron nuevos registros.', 'error');
            return false;
        }

        // Agregar solo los registros nuevos
        const currentTotalRecords = Object.values(allData).reduce((sum, arr) => sum + arr.length, 0);

        newRecords.forEach((record, index) => {
            record.no = (currentTotalRecords + index + 1).toString();
            const category = categorizeRecord(record.referencia);
            const newIndex = allData[category].length;
            record.id = `${category}_${newIndex}`;
            allData[category].push(record);
        });

        // Copiar a filteredData
        filteredData = JSON.parse(JSON.stringify(allData));

        const newCounts = {};
        Object.keys(allData).forEach(cat => {
            newCounts[cat] = newRecords.filter(r => categorizeRecord(r.referencia) === cat).length;
        });

        showStatus(`✅ ${newRecords.length} registros nuevos agregados exitosamente: Servicios(+${newCounts.servicios}), StockComp(+${newCounts.stockcomp}), Stock#(+${newCounts.stocknum}), Otros(+${newCounts.otros})`, 'success');
        updateTabCounts();
        renderTable(currentCategory);

    } else {

        // Limpiar datos existentes
        allData = {
            servicios: [],
            stockcomp: [],
            stocknum: [],
            otros: []
        };

        // Procesar y categorizar todos los registros
        newRecordsFromFile.forEach((record) => {
            const category = categorizeRecord(record.referencia);
            record.id = `${category}_${allData[category].length}`;
            allData[category].push(record);
        });

        // Actualizar IDs únicos por categoría
        Object.keys(allData).forEach(category => {
            allData[category].forEach((record, index) => {
                record.id = `${category}_${index}`;
            });
        });

        // Copiar a filteredData
        filteredData = JSON.parse(JSON.stringify(allData));

        const totalRecords = Object.values(allData).reduce((sum, arr) => sum + arr.length, 0);
        showStatus(`📊 Archivo procesado exitosamente. ${totalRecords} registros categorizados: Servicios(${allData.servicios.length}), StockComp(${allData.stockcomp.length}), Stock#(${allData.stocknum.length}), Otros(${allData.otros.length})`, 'success');
        updateTabCounts();
        renderTable(currentCategory);
    }

    dataSection.style.display = 'block';
    autoCheckACCRecords();
    switchTab('servicios');
    return true;
}

// Función para verificar y auto-acreditar registros tipo ACC
function autoCheckACCRecords() {
    ['servicios', 'stockcomp', 'stocknum', 'otros'].forEach(category => {
        allData[category].forEach(record => {
            if (record.tipo && record.tipo.toUpperCase() === 'ACC' && !record.credited) {
                record.credited = true;
                record.creditDate = new Date().toLocaleDateString('es-ES');
                record.creditReason = 'paid';
                record.creditNotes = 'Auto-acreditado por tipo ACC';
                record.creditedBy = 'Sistema';
            }
        });
    });
    
    filteredData = JSON.parse(JSON.stringify(allData));
}

// AGREGAR esta nueva función en refacciones.js:

function showAlternativeMethods(alternatives) {
    const statusDiv = document.getElementById('status');
    
    statusDiv.innerHTML = `
        <div style="background: linear-gradient(135deg, #fff3cd 0%, #fff9db 100%); padding: 25px; border-radius: 15px; border-left: 5px solid #ffc107; margin-top: 20px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                <span style="font-size: 2.5rem;">🔐</span>
                <h3 style="margin: 0; color: #856404;">Tipo de Encriptación No Soportado</h3>
            </div>
            
            <p style="color: #856404; margin: 10px 0; font-size: 1rem; line-height: 1.6;">
                <strong>Este archivo Excel usa un método de encriptación antiguo o propietario que no se puede desencriptar automáticamente.</strong>
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <strong style="color: #392677; display: block; margin-bottom: 15px; font-size: 1.1rem;">🛠️ Métodos Alternativos:</strong>
                
                ${alternatives.map((alt, i) => `
                    <div style="margin: 15px 0; padding: 15px; background: ${i === 0 ? '#e8f5e9' : i === 1 ? '#e3f2fd' : '#f3e5f5'}; border-radius: 8px; border-left: 4px solid ${i === 0 ? '#4caf50' : i === 1 ? '#2196f3' : '#9c27b0'};">
                        <strong style="color: ${i === 0 ? '#2e7d32' : i === 1 ? '#1565c0' : '#6a1b9a'};">Método ${i + 1}:</strong>
                        <p style="margin: 8px 0 0 0; color: #333; line-height: 1.6;">${alt}</p>
                    </div>
                `).join('')}
            </div>
            
            <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-top: 20px;">
                <strong style="color: #1976d2;">💡 Recomendación:</strong>
                <p style="margin: 8px 0; color: #1565c0; line-height: 1.6;">
                    El método más rápido es abrir el archivo en Excel, ir a <strong>Archivo → Información → Proteger libro → Cifrar con contraseña</strong>, 
                    eliminar la contraseña (dejar vacío), y guardar. Luego vuelve a cargarlo aquí.
                </p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
                <button onclick="location.reload()" style="padding: 12px 30px; background: var(--azul); color: white; border: none; border-radius: 25px; cursor: pointer; font-weight: 600;">
                    🔄 Intentar con otro archivo
                </button>
            </div>
        </div>
    `;
    
    statusDiv.className = 'status';
    statusDiv.style.display = 'block';
}

function showManualEntry() {
    // Crear datos de ejemplo categorizados
    allData = {
        servicios: [
            {
                id: 'servicios_0',
                no: '1',
                tipo: 'CM',
                factura: 'ESCN0311068',
                referencia: 'RNN0997105',
                fechaFactura: '13/05/2025',
                fechaVencimiento: '13/05/2025',
                moneda: 'MXN',
                importe: '3,600.85',
                pago: '0',
                balance: '3,600.85',
                color: 'none',
                quien: '',
                pendiente: '3,600.85'
            }
        ],
        stockcomp: [
            {
                id: 'stockcomp_0',
                no: '2',
                tipo: 'CM',
                factura: 'ESCN0311069',
                referencia: 'STOCKCOMP001234',
                fechaFactura: '13/05/2025',
                fechaVencimiento: '13/05/2025',
                moneda: 'MXN',
                importe: '1,500.00',
                pago: '0',
                balance: '1,500.00',
                color: 'none',
                quien: '',
                pendiente: '1,500.00'
            }
        ],
        stocknum: [
            {
                id: 'stocknum_0',
                no: '3',
                tipo: 'CM',
                factura: 'ESCN0311070',
                referencia: 'STOCK123',
                fechaFactura: '13/05/2025',
                fechaVencimiento: '13/05/2025',
                moneda: 'MXN',
                importe: '2,200.00',
                pago: '0',
                balance: '2,200.00',
                color: 'none',
                quien: '',
                pendiente: '2,200.00'
            }
        ],
        otros: [
            {
                id: 'otros_0',
                no: '4',
                tipo: 'CM',
                factura: 'ESCN0311071',
                referencia: 'ESIN1003196',
                fechaFactura: '13/05/2025',
                fechaVencimiento: '13/05/2025',
                moneda: 'MXN',
                importe: '2,034.62',
                pago: '0',
                balance: '2,034.62',
                color: 'none',
                quien: '',
                pendiente: '2,034.62'
            }
        ]
    };

    filteredData = JSON.parse(JSON.stringify(allData));
    switchTab('servicios');
    dataSection.style.display = 'block';
    showStatus('Datos de ejemplo cargados y categorizados. Puedes editarlos y agregar más registros.', 'success');
    updateTabCounts();
}

function parseDate(dateStr) {
    if (!dateStr || dateStr === '') return new Date(0);

    // Si es un número (posible serial de Excel)
    if (!isNaN(dateStr) && typeof dateStr !== 'object') {
        const serialNumber = Number(dateStr);
        if (serialNumber > 0) {
            const excelEpoch = new Date(1900, 0, 1);
            const adjustedSerial = serialNumber > 59 ? serialNumber - 2 : serialNumber - 1;
            return new Date(excelEpoch.getTime() + adjustedSerial * 86400000);
        }
        return new Date(0);
    }

    // DD/MM/YYYY
    const match1 = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match1) {
        const day = Number(match1[1]);
        const month = Number(match1[2]);
        const year = Number(match1[3]);
        return new Date(year, month - 1, day);
    }
    
    // YYYY-MM-DD
    const match2 = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match2) {
        const year = Number(match2[1]);
        const month = Number(match2[2]);
        const day = Number(match2[3]);
        return new Date(year, month - 1, day);
    }
    
    // DD-MM-YYYY
    const match3 = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (match3) {
        const day = Number(match3[1]);
        const month = Number(match3[2]);
        const year = Number(match3[3]);
        return new Date(year, month - 1, day);
    }
    
    return new Date(0);
}

function getISOWeekInfo(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return {
        year: d.getUTCFullYear(),
        week: weekNo
    };
}

function getWeekRange(date) {
    const d = new Date(date);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    
    const endOfWeek = new Date(monday);
    endOfWeek.setDate(monday.getDate() + 6);
    
    const { year, week } = getISOWeekInfo(date);
    
    return {
        start: monday,
        end: endOfWeek,
        label: `Semana ${week} (${monday.getDate()}/${monday.getMonth() + 1} - ${endOfWeek.getDate()}/${endOfWeek.getMonth() + 1}/${endOfWeek.getFullYear()})`,
        key: `${year}-W${week}`
    };
}

function getMonthRange(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    return {
        start: new Date(year, month, 1),
        end: new Date(year, month + 1, 0),
        label: `${monthNames[month]} ${year}`
    };
}

function sortRecords(records, sortBy) {
    return [...records].sort((a, b) => {
        switch (sortBy) {
            case 'date-asc':
                return parseDate(a.fechaFactura) - parseDate(b.fechaFactura);
            case 'date-desc':
                return parseDate(b.fechaFactura) - parseDate(a.fechaFactura);
            case 'due-asc':
                return parseDate(a.fechaVencimiento) - parseDate(b.fechaVencimiento);
            case 'due-desc':
                return parseDate(b.fechaVencimiento) - parseDate(a.fechaVencimiento);
            case 'amount-asc':
                return parseFloat(a.importe.replace(/,/g, '')) - parseFloat(b.importe.replace(/,/g, ''));
            case 'amount-desc':
                return parseFloat(b.importe.replace(/,/g, '')) - parseFloat(a.importe.replace(/,/g, ''));
            default:
                return 0;
        }
    });
}

function groupRecordsByPeriod(records, groupBy) {
    if (groupBy === 'none') {
        return [{ label: 'Todos los registros', records: records, summary: '' }];
    }

    const groups = {};

    records.forEach(record => {
        const date = parseDate(record.fechaFactura);
        let key, range;

        if (groupBy === 'week') {
            range = getWeekRange(date);
            key = range.key;
        } else if (groupBy === 'month') {
            range = getMonthRange(date);
            key = `${range.start.getFullYear()}-${range.start.getMonth()}`;
        }

        if (!groups[key]) {
            groups[key] = {
                label: range.label,
                records: [],
                start: range.start,
                totalAmount: 0,
                count: 0
            };
        }

        groups[key].records.push(record);
        groups[key].totalAmount += parseFloat(record.importe.replace(/,/g, '') || 0);
        groups[key].count++;
    });

    return Object.values(groups)
        .sort((a, b) => {
            // CAMBIO PRINCIPAL: Ordenar grupos según la opción de ordenamiento actual
            const currentSortOption = sortingOptions[currentCategory];
            if (currentSortOption === 'date-asc') {
                return a.start - b.start; // Orden ascendente (más antiguos primero)
            } else {
                return b.start - a.start; // Orden descendente (más recientes primero)
            }
        })
        .map(group => ({
            ...group,
            summary: `${group.count} registros - Total: $${group.totalAmount.toLocaleString()}`
        }));
}

function resetOptionsToDefault() {
    // Resetear agrupaciones
    groupingOptions = {
        servicios: 'none',
        stockcomp: 'none',
        stocknum: 'none',
        otros: 'none'
    };
    
    // Resetear ordenamientos a fecha de vencimiento ascendente (más próxima primero)
    sortingOptions = {
        servicios: 'due-asc',
        stockcomp: 'due-asc',
        stocknum: 'due-asc',
        otros: 'due-asc'
    };
    
    // Actualizar los selectores en la interfaz
    ['servicios', 'stockcomp', 'stocknum', 'otros'].forEach(category => {
        const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
        
        // Actualizar selector de agrupación
        const groupSelect = document.getElementById(`groupBy${capitalizedCategory}`);
        if (groupSelect) {
            groupSelect.value = 'none';
        }
        
        // Actualizar selector de ordenamiento
        const sortSelect = document.getElementById(`sortBy${capitalizedCategory}`);
        if (sortSelect) {
            sortSelect.value = 'due-asc';
        }
    });
}

function renderTable(category = currentCategory) {
    const activeTableBody = document.getElementById(`tableBody${category.charAt(0).toUpperCase() + category.slice(1)}`);
    const creditedTableBody = document.getElementById(`creditedTableBody${category.charAt(0).toUpperCase() + category.slice(1)}`);
    const overdueTableBody = document.getElementById(`overdueTableBody${category.charAt(0).toUpperCase() + category.slice(1)}`);
    const warningTableBody = document.getElementById(`warningTableBody${category.charAt(0).toUpperCase() + category.slice(1)}`);
    
    const creditedContainer = document.getElementById(`creditedTableContainer${category.charAt(0).toUpperCase() + category.slice(1)}`);
    const overdueContainer = document.getElementById(`overdueTableContainer${category.charAt(0).toUpperCase() + category.slice(1)}`);
    const warningContainer = document.getElementById(`warningTableContainer${category.charAt(0).toUpperCase() + category.slice(1)}`);
    
    const recordCount = document.getElementById(`recordCount${category.charAt(0).toUpperCase() + category.slice(1)}`);
    
    if (!activeTableBody) return;

    // Limpiar todas las tablas
    activeTableBody.innerHTML = '';
    if (creditedTableBody) creditedTableBody.innerHTML = '';
    if (overdueTableBody) overdueTableBody.innerHTML = '';
    if (warningTableBody) warningTableBody.innerHTML = '';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // ✅ Calcular fecha límite para advertencia (7 días desde hoy)
    const warningDate = new Date(today);
    warningDate.setDate(warningDate.getDate() + 7);
    
    // ✅ SEPARAR registros en 4 grupos
    const overdueRecords = filteredData[category].filter(r => {
        if (r.credited) return false;
        const vencimiento = parseDate(r.fechaVencimiento);
        return vencimiento < today;
    });
    
    const warningRecords = filteredData[category].filter(r => {
        if (r.credited) return false;
        const vencimiento = parseDate(r.fechaVencimiento);
        return vencimiento >= today && vencimiento <= warningDate;
    });
    
    const activeRecords = filteredData[category].filter(r => {
        if (r.credited) return false;
        const vencimiento = parseDate(r.fechaVencimiento);
        return vencimiento > warningDate;
    });
    
    const creditedRecords = filteredData[category].filter(r => r.credited);
    
    // ============ RENDERIZAR FACTURAS VENCIDAS ============
    if (overdueRecords.length > 0) {
        const sortedOverdue = sortRecords(overdueRecords, sortingOptions[category]);
        const groupedOverdue = groupRecordsByPeriod(sortedOverdue, groupingOptions[category]);
        
        groupedOverdue.forEach(group => {
            if (groupingOptions[category] !== 'none') {
                const headerRow = document.createElement('tr');
                headerRow.innerHTML = `
                    <td colspan="11" class="week-header" style="background: #dc3545;">
                        <span>${group.label}</span>
                        <span class="week-summary">${group.summary}</span>
                    </td>
                `;
                overdueTableBody.appendChild(headerRow);
            }
            
            group.records.forEach((row) => {
                const tr = createRecordRow(row, category);
                overdueTableBody.appendChild(tr);
            });
        });
        
        overdueContainer.style.display = 'block';
    } else {
        overdueContainer.style.display = 'none';
    }
    
    // ============ RENDERIZAR FACTURAS CON ADVERTENCIA (PRÓXIMAS A VENCER) ============
    if (warningRecords.length > 0) {
        const sortedWarning = sortRecords(warningRecords, sortingOptions[category]);
        const groupedWarning = groupRecordsByPeriod(sortedWarning, groupingOptions[category]);
        
        groupedWarning.forEach(group => {
            if (groupingOptions[category] !== 'none') {
                const headerRow = document.createElement('tr');
                headerRow.innerHTML = `
                    <td colspan="11" class="week-header" style="background: #ffc107;">
                        <span>${group.label}</span>
                        <span class="week-summary">${group.summary}</span>
                    </td>
                `;
                warningTableBody.appendChild(headerRow);
            }
            
            group.records.forEach((row) => {
                const tr = createRecordRow(row, category);
                warningTableBody.appendChild(tr);
            });
        });
        
        warningContainer.style.display = 'block';
    } else {
        warningContainer.style.display = 'none';
    }
    
    // ============ RENDERIZAR REGISTROS ACTIVOS ============
    const sortedActive = sortRecords(activeRecords, sortingOptions[category]);
    const groupedActive = groupRecordsByPeriod(sortedActive, groupingOptions[category]);
    
    groupedActive.forEach(group => {
        if (groupingOptions[category] !== 'none') {
            const headerRow = document.createElement('tr');
            headerRow.innerHTML = `
                <td colspan="11" class="week-header">
                    <span>${group.label}</span>
                    <span class="week-summary">${group.summary}</span>
                </td>
            `;
            activeTableBody.appendChild(headerRow);
        }
        
        group.records.forEach((row) => {
            const tr = createRecordRow(row, category);
            activeTableBody.appendChild(tr);
        });
    });
    
    // ============ RENDERIZAR REGISTROS ACREDITADOS ============
    if (creditedRecords.length > 0) {
        const sortedCredited = creditedRecords.sort((a, b) => {
            const dateA = parseDate(a.creditDate || '01/01/2000');
            const dateB = parseDate(b.creditDate || '01/01/2000');
            return dateB - dateA;
        });
        
        sortedCredited.forEach((row) => {
            const tr = createRecordRow(row, category);
            creditedTableBody.appendChild(tr);
        });
        
        creditedContainer.style.display = 'block';
    } else {
        creditedContainer.style.display = 'none';
    }

    // ============ ACTUALIZAR CONTADORES ============
    if (recordCount) {
        const totalCount = filteredData[category].length;
        const overdueCount = overdueRecords.length;
        const warningCount = warningRecords.length;
        const activeCount = activeRecords.length;
        const creditedCount = creditedRecords.length;
        
        let countsHTML = `<span style="color: var(--azul); font-weight: 600;">${totalCount} registros totales</span>`;
        
        const parts = [];
        if (overdueCount > 0) parts.push(`<span style="color: #dc3545;">🔴 Vencidos: ${overdueCount}</span>`);
        if (warningCount > 0) parts.push(`<span style="color: #ffc107;">⚠️ Próximos: ${warningCount}</span>`);
        if (activeCount > 0) parts.push(`📋 Activos: ${activeCount}`);
        if (creditedCount > 0) parts.push(`✅ Acreditados: ${creditedCount}`);
        
        if (parts.length > 0) {
            countsHTML += `<span style="margin-left: 15px; color: #666;">${parts.join(' | ')}</span>`;
        }
        
        recordCount.innerHTML = countsHTML;
    }

    setupEditableFields();
}

// ✅ FUNCIÓN AUXILIAR para crear filas (SIN cambios, pero corregida la palomita)
function createRecordRow(row, category) {
    const tr = document.createElement('tr');

    let colorClass = '';
    if (row.color && row.color !== 'none') {
        colorClass = `row-${row.color}`;
    }

    tr.className = colorClass;

    tr.innerHTML = `
        <td>${row.no}</td>
        <td><input type="text" class="editable" value="${row.tipo}" data-field="tipo" data-id="${row.id}"></td>
        <td><input type="text" class="editable" value="${row.factura}" data-field="factura" data-id="${row.id}"></td>
        <td><input type="text" class="editable" value="${row.referencia}" data-field="referencia" data-id="${row.id}"></td>
        <td><input type="text" class="editable" value="${row.fechaFactura}" data-field="fechaFactura" data-id="${row.id}"></td>
        <td><input type="text" class="editable" value="${row.fechaVencimiento}" data-field="fechaVencimiento" data-id="${row.id}"></td>
        <td><input type="text" class="editable" value="${row.moneda}" data-field="moneda" data-id="${row.id}"></td>
        <td class="money ${parseFloat(row.importe.replace(/,/g, '')) > 0 ? 'negative' : 'positive'}">
            <input type="text" class="editable" value="${row.importe}" data-field="importe" data-id="${row.id}">
        </td>
        <td class="money">
            <input type="text" class="editable" value="${row.pago}" data-field="pago" data-id="${row.id}">
        </td>
        <td class="money ${parseFloat(row.balance.replace(/,/g, '')) > 0 ? 'negative' : 'positive'}">
            <input type="text" class="editable" value="${row.balance}" data-field="balance" data-id="${row.id}">
        </td>
        <td style="min-width: 120px;">
            <div style="display:flex;align-items:center;gap:6px;justify-content:flex-start;">
                <span style="display:inline-block;width:18px;height:18px;border-radius:50%;border:1.5px solid #bbb;flex-shrink:0;${row.color && row.color !== 'none' ? `background:${getColorHex(row.color)};` : 'background: repeating-linear-gradient(45deg, #fff 0 4px, #eee 4px 8px);'}"></span>
                ${row.credited ? '<span style="font-size:1.1rem;line-height:1;flex-shrink:0;" title="Registro acreditado">✅</span>' : ''}
                <button class="modal-button secondary" style="padding:4px 10px;font-size:1rem;" onclick="openEditModal('${row.id}')">✏️</button>
            </div>
        </td>
    `;
    
    tr.ondblclick = function() {
        openEditModal(row.id);
    };
    
    return tr;
}

// Función para manejar la edición en línea de campos
function setupEditableFields() {
    document.querySelectorAll('.editable').forEach(input => {
        input.addEventListener('blur', function() {
            const recordId = this.dataset.id;
            const field = this.dataset.field;
            let newValue = this.value.trim();
            
            if (!recordId || !field) return;
            
            const [category, index] = recordId.split('_');
            const record = allData[category][parseInt(index)];
            
            if (!record) return;
            
            // Guardar el valor anterior para comparación
            const oldValue = record[field];
            
            // ✅ Validaciones específicas por campo
            if (field === 'fechaFactura' || field === 'fechaVencimiento') {
                // Validar formato de fecha DD/MM/YYYY
                const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
                if (newValue && !dateRegex.test(newValue)) {
                    showStatus('❌ Formato de fecha inválido (DD/MM/YYYY)', 'error');
                    this.value = oldValue; // Restaurar valor anterior
                    this.style.borderColor = '#e74c3c';
                    setTimeout(() => {
                        this.style.borderColor = '';
                    }, 2000);
                    return;
                }
            }
            
            // Actualizar el valor
            record[field] = newValue;
            
            // Si se cambió el tipo a ACC, auto-acreditar
            if (field === 'tipo' && newValue.toUpperCase() === 'ACC' && !record.credited) {
                record.credited = true;
                record.creditDate = new Date().toLocaleDateString('es-ES');
                record.creditReason = 'paid';
                record.creditNotes = 'Auto-acreditado por tipo ACC';
                record.creditedBy = 'Sistema';
                
                showStatus('✅ Tipo cambiado a ACC - Registro auto-acreditado', 'success');
                renderTable(category);
                updateTabCounts();
                return;
            }
            
            // Sincronizar con filteredData
            filteredData[category][parseInt(index)] = {...record};

            if ((field === 'fechaFactura' || field === 'fechaVencimiento') && oldValue !== newValue) {
                renderTable(category);
                updateTabCounts();
                
                // Mostrar confirmación
                const toast = document.createElement('div');
                toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: #4caf50; color: white; padding: 10px 20px; border-radius: 5px; z-index: 10000; font-size: 0.9rem; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
                toast.textContent = '✓ Fecha actualizada - Registro reclasificado';
                document.body.appendChild(toast);
                
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity 0.3s';
                    setTimeout(() => toast.remove(), 300);
                }, 1500);
                
                return; // Salir para evitar el toast duplicado
            }
            
            // Mostrar confirmación visual si el valor cambió
            if (oldValue !== newValue) {
                this.style.background = '#e8f5e9';
                this.style.borderColor = '#4caf50';
                
                setTimeout(() => {
                    this.style.background = '';
                    this.style.borderColor = '';
                }, 800);
                
                // Mostrar toast pequeño
                const toast = document.createElement('div');
                toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: #4caf50; color: white; padding: 10px 20px; border-radius: 5px; z-index: 10000; font-size: 0.9rem; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
                toast.textContent = '✓ Cambio guardado';
                document.body.appendChild(toast);
                
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity 0.3s';
                    setTimeout(() => toast.remove(), 300);
                }, 1500);
            }
        });
        
        // Permitir Enter para guardar
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.blur();
            }
            
            // ESC para cancelar
            if (e.key === 'Escape') {
                const recordId = this.dataset.id;
                const field = this.dataset.field;
                const [category, index] = recordId.split('_');
                const record = allData[category][parseInt(index)];
                this.value = record[field]; // Restaurar valor original
                this.blur();
            }
        });
        
        // Visual feedback al enfocar
        input.addEventListener('focus', function() {
            this.style.background = '#fffef7';
            this.style.borderColor = '#ffc107';
        });
    });
}

function filterData(category) {
    const searchInput = document.getElementById(`searchInput${category.charAt(0).toUpperCase() + category.slice(1)}`);
    if (!searchInput) return;
    
    const searchTerm = searchInput.value.toLowerCase();
    
    if (!searchTerm) {
        filteredData[category] = [...allData[category]];
    } else {
        filteredData[category] = allData[category].filter(row => 
            Object.values(row).some(value => 
                value && value.toString().toLowerCase().includes(searchTerm)
            )
        );
    }
    
    renderTable(category);
}

function saveData(category) {
    if (allData[category].length === 0) {
        showStatus(`No hay datos para guardar en ${category}`, 'error');
        return;
    }

    const ws = XLSX.utils.json_to_sheet(allData[category].map(row => ({
        'No': row.no,
        'Tipo': row.tipo,
        'Nº Factura': row.factura,
        'N ° de referencia': row.referencia,
        'Fecha Factura': row.fechaFactura,
        'Fecha de vencimiento': row.fechaVencimiento,
        'Moneda': row.moneda,
        'Importe Factura': row.importe,
        'Importe de pago': row.pago,
        'Balance': row.balance,
        'Quien pago': row.quien,
        'Pendiente': row.pendiente,
        'Color': row.color
    })));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, category.charAt(0).toUpperCase() + category.slice(1));

    const fileName = `${category}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showStatus(`Archivo de ${category} guardado exitosamente como: ${fileName}`, 'success');
}

function addNewRecord(category) {

    currentAddCategory = category;
    
    // Limpiar formulario
    document.getElementById('addTipo').value = '';
    document.getElementById('addFactura').value = '';
    document.getElementById('addReferencia').value = '';
    document.getElementById('addFechaFactura').value = '';
    document.getElementById('addFechaVencimiento').value = '';
    document.getElementById('addMoneda').value = 'MXN';
    document.getElementById('addImporte').value = '';
    document.getElementById('addPago').value = '0';
    document.getElementById('addBalance').value = '';
    
    // Establecer placeholder de referencia según categoría
    const referenciaInput = document.getElementById('addReferencia');
    let placeholderRef = '';
    switch(category) {
        case 'servicios':
            placeholderRef = 'RNN0997105';
            break;
        case 'stockcomp':
            placeholderRef = 'STOCKCOMP001234';
            break;
        case 'stocknum':
            placeholderRef = 'STOCK123';
            break;
        case 'otros':
            placeholderRef = 'OTRO123456';
            break;
    }
    referenciaInput.placeholder = placeholderRef;

    // Obtener fecha actual en formato DD/MM/YYYY
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const todayFormatted = `${day}/${month}/${year}`;

    // Establecer fechas por defecto
    document.getElementById('addFechaFactura').value = todayFormatted;
    document.getElementById('addFechaVencimiento').value = todayFormatted;
    
    // Mostrar el modal
    document.getElementById('addModal').style.display = 'block';
    
    // Focus en el primer campo
    document.getElementById('addTipo').focus();
}

function openEditModal(recordId) {
    currentEditingId = recordId;
    const [category, index] = recordId.split('_');
    const record = allData[category][parseInt(index)];
    
    if (!record) return;

    document.getElementById('editPago').value = '';
    document.getElementById('editPago').placeholder = '0.00';
    document.getElementById('editQuien').value = '';

    document.querySelectorAll('.color-option').forEach(option => {
        option.classList.remove('selected');
    });
    const selectedColor = document.querySelector(`[data-color="${record.color || 'none'}"]`);
    if (selectedColor) {
        selectedColor.classList.add('selected');
    }

    document.querySelectorAll('.color-option').forEach(option => {
        option.onclick = function() {
            document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
        };
    });

    updateCreditStatus(record);
    loadPaymentHistory(record);

    document.getElementById('editModal').style.display = 'block';
}

function loadPaymentHistory(record) {
    const historyContainer = document.getElementById('paymentHistory');
    const originalAmountSpan = document.getElementById('originalAmount');
    const totalPaidSpan = document.getElementById('totalPaid');
    const remainingAmountSpan = document.getElementById('remainingAmount');
    
    if (!record.paymentHistory) {
        record.paymentHistory = [];
    }
    
    const originalAmount = parseFloat(record.importe.replace(/,/g, '')) || 0;
    originalAmountSpan.textContent = `$${Math.abs(originalAmount).toLocaleString()}`;
    
    const totalPaid = record.paymentHistory.reduce((sum, payment) => {
        return sum + (parseFloat(payment.amount.replace(/,/g, '')) || 0);
    }, 0);
    totalPaidSpan.textContent = `$${totalPaid.toLocaleString()}`;
    
    const remaining = Math.abs(originalAmount) - totalPaid;
    remainingAmountSpan.textContent = `$${remaining.toLocaleString()}`;

    const pagoInput = document.getElementById('editPago');
    if (pagoInput) {
        pagoInput.value = '';
        pagoInput.placeholder = '0.00';
    }
    
    if (record.paymentHistory.length === 0) {
        historyContainer.innerHTML = '<div class="no-payments">📝 No hay pagos registrados</div>';
    } else {
        historyContainer.innerHTML = record.paymentHistory
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map((payment, index) => `
                <div class="payment-entry">
                    <div class="payment-controls">
                        <button class="payment-btn edit" onclick="editPayment(${index})" title="Editar pago">✏️</button>
                        <button class="payment-btn delete" onclick="deletePayment(${index})" title="Eliminar pago">🗑️</button>
                    </div>
                    <div class="payment-header">
                        <span class="payment-amount">$${parseFloat(payment.amount.replace(/,/g, '')).toLocaleString()}</span>
                        <span class="payment-date">${payment.date}</span>
                    </div>
                    <div class="payment-person">👤 ${payment.person}</div>
                </div>
            `).join('');
    }

    // Mostrar advertencia si está sobrepagado
    if (remaining < 0) {
        const warningDiv = document.createElement('div');
        warningDiv.style.cssText = 'background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 5px; margin: 10px 0; color: #856404;';
        warningDiv.innerHTML = `⚠️ <strong>Sobrepago:</strong> Se han registrado $${Math.abs(remaining).toLocaleString()} de más`;
        historyContainer.prepend(warningDiv);
    }
}

function closeModal() {
    document.getElementById('editModal').style.display = 'none';
    currentEditingId = null;
}

// Función para cerrar el modal de agregar
function closeAddModal() {
    document.getElementById('addModal').style.display = 'none';
    currentAddCategory = null;
}

function saveEdit() {
    if (!currentEditingId) return;
    const [category, index] = currentEditingId.split('_');
    const record = allData[category][parseInt(index)];
    if (!record) return;

    const selectedColor = document.querySelector('.color-option.selected');
    const pagoInput = document.getElementById('editPago');
    const quienInput = document.getElementById('editQuien');
    const pago = pagoInput.value.trim();
    const quien = quienInput.value.trim();

    // ✅ VALIDACIONES: Si hay monto, debe haber nombre (y viceversa)
    const pagoAmount = parseFloat(pago.replace(/,/g, '')) || 0;
    const hasAmount = pagoAmount > 0;
    const hasName = quien.length > 0;

    // Limpiar estilos previos
    pagoInput.style.borderColor = '';
    pagoInput.style.background = '';
    quienInput.style.borderColor = '';
    quienInput.style.background = '';

    // Validar que si hay monto, debe haber nombre
    if (hasAmount && !hasName) {
        quienInput.style.borderColor = '#e74c3c';
        quienInput.style.background = '#ffebee';
        quienInput.focus();
        
        showStatus('❌ Falta especificar quién realizó el pago', 'error');
        
        // Animación de shake
        quienInput.style.animation = 'shake 0.5s';
        setTimeout(() => {
            quienInput.style.animation = '';
        }, 500);
        
        return; // ❌ No permitir guardar
    }

    // Validar que si hay nombre, debe haber monto
    if (hasName && !hasAmount) {
        pagoInput.style.borderColor = '#e74c3c';
        pagoInput.style.background = '#ffebee';
        pagoInput.focus();
        
        showStatus('❌ Falta especificar el monto del pago', 'error');
        
        // Animación de shake
        pagoInput.style.animation = 'shake 0.5s';
        setTimeout(() => {
            pagoInput.style.animation = '';
        }, 500);
        
        return; // ❌ No permitir guardar
    }

    // Validar y procesar nuevo pago
    if (pago && parseFloat(pago.replace(/,/g, '')) > 0 && quien) {
        if (!record.paymentHistory) {
            record.paymentHistory = [];
        }
        
        const newPaymentAmount = parseFloat(pago.replace(/,/g, ''));
        const importeOriginal = parseFloat(record.importe.replace(/,/g, '')) || 0;
        const originalAmount = Math.abs(importeOriginal);
        
        // Calcular total ya pagado
        const totalPaid = record.paymentHistory.reduce((sum, payment) => {
            return sum + (parseFloat(payment.amount.replace(/,/g, '')) || 0);
        }, 0);
        
        // Validar que no exceda el monto original
        if (totalPaid + newPaymentAmount > originalAmount) {
            const maxAllowed = originalAmount - totalPaid;
            showStatus(`❌ El pago no puede exceder el monto pendiente. Máximo permitido: $${maxAllowed.toLocaleString()}`, 'error');
            return;
        }
        
        // Agregar el nuevo pago
        record.paymentHistory.push({
            amount: newPaymentAmount.toLocaleString(),
            person: quien,
            date: new Date().toLocaleDateString('es-ES')
        });

        // ✅ Limpiar campos después de agregar pago
        document.getElementById('editPago').value = '';
        document.getElementById('editPago').placeholder = '0.00';
        document.getElementById('editQuien').value = '';

        // Enfocar en el campo de pago para siguiente entrada
        const pagoInput = document.getElementById('editPago');
        if (pagoInput) {
            setTimeout(() => pagoInput.focus(), 100);
        }
        
        // Recalcular totales
        const newTotalPaid = totalPaid + newPaymentAmount;
        const remaining = originalAmount - newTotalPaid;
        
        // Actualizar campos calculados
        record.pago = newTotalPaid.toLocaleString();
        record.pendiente = remaining.toLocaleString();
        
        // ✅ CORRECCIÓN: Balance = Importe Original ± Total Pagado
        let newBalance;
        if (importeOriginal > 0) {
            // Pago que hago: 2000 - 1000 = 1000 (lo que aún debo pagar)
            newBalance = importeOriginal - newTotalPaid;
        } else {
            // Valores negativos (si los hay): -2000 + 1000 = -1000
            newBalance = importeOriginal + newTotalPaid;
        }
        record.balance = newBalance.toLocaleString();

        // ✅ NUEVO: Si este pago completa el total, mostrar modal de acreditación automáticamente
        const isFullyPaidNow = remaining <= 0.01; // Tolerancia para centavos

        if (isFullyPaidNow && !record.credited) {
            // Sincronizar datos primero
            filteredData[category][parseInt(index)] = {...record};
            
            // Actualizar UI
            loadPaymentHistory(record);
            updateCreditStatus(record);
            renderTable(category);
            updateTabCounts();
            
            // Mostrar modal de acreditación automáticamente
            showStatus('✅ Pago completado. ¿Deseas acreditar este registro?', 'success');
            
            // Pequeño delay para que el usuario vea el mensaje
            setTimeout(() => {
                showCreditConfirmationModal(record);
            }, 800);
            
            return; // Salir aquí para no cerrar el modal de edición aún
        }
        
    } else {
        // Solo actualizar otros campos sin procesar pago
        if (pago) record.pago = pago;
    }

    // Actualizar color
    record.color = selectedColor ? selectedColor.dataset.color : 'none';
    record.quien = quien;

    // ✅ NUEVO: Auto-acreditar si el tipo es ACC
    if (record.tipo && record.tipo.toUpperCase() === 'ACC' && !record.credited) {
        record.credited = true;
        record.creditDate = new Date().toLocaleDateString('es-ES');
        record.creditReason = 'paid';
        record.creditNotes = 'Auto-acreditado por tipo ACC';
        record.creditedBy = 'Sistema';
        
        showStatus('✅ Registro actualizado y auto-acreditado (tipo ACC)', 'success');
    }

    // Sincronizar datos
    filteredData[category][parseInt(index)] = {...record};
    
    loadPaymentHistory(record);
    renderTable(category);
    updateTabCounts();
    closeModal();

    if (!record.credited || record.tipo.toUpperCase() !== 'ACC') {
        showStatus('✅ Registro actualizado exitosamente', 'success');
    }
}

function saveNewRecord() {
    const tipo = document.getElementById('addTipo').value.trim();
    const factura = document.getElementById('addFactura').value.trim();
    const referencia = document.getElementById('addReferencia').value.trim();
    const fechaFactura = document.getElementById('addFechaFactura').value.trim();
    const fechaVencimiento = document.getElementById('addFechaVencimiento').value.trim();
    const moneda = document.getElementById('addMoneda').value;
    const importe = document.getElementById('addImporte').value.trim();
    const pago = document.getElementById('addPago').value.trim() || '0';
    const balance = document.getElementById('addBalance').value.trim();
    
    // Validaciones básicas
    if (!factura) {
        showStatus('❌ El número de factura es requerido', 'error');
        return;
    }
    
    if (!referencia) {
        showStatus('❌ La referencia es requerida', 'error');
        return;
    }
    
    if (!fechaFactura) {
        showStatus('❌ La fecha de factura es requerida', 'error');
        return;
    }
    
    if (!importe) {
        showStatus('❌ El importe es requerido', 'error');
        return;
    }
    
    // Validar formato de fecha
    const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    if (!dateRegex.test(fechaFactura)) {
        showStatus('❌ Formato de fecha de factura inválido (DD/MM/YYYY)', 'error');
        return;
    }
    
    if (fechaVencimiento && !dateRegex.test(fechaVencimiento)) {
        showStatus('❌ Formato de fecha de vencimiento inválido (DD/MM/YYYY)', 'error');
        return;
    }
    
    // Determinar categoría basada en la referencia si no se especifica
    const finalCategory = currentAddCategory || categorizeRecord(referencia);
    
    // Crear el nuevo registro
    const newIndex = allData[finalCategory].length;
    const totalRecords = Object.values(allData).reduce((sum, arr) => sum + arr.length, 0);
    
    const newRecord = {
        id: `${finalCategory}_${newIndex}`,
        no: (totalRecords + 1).toString(),
        tipo: tipo || '',
        factura: factura,
        referencia: referencia,
        fechaFactura: fechaFactura,
        fechaVencimiento: fechaVencimiento || fechaFactura,
        moneda: moneda,
        importe: importe,
        pago: pago,
        balance: balance || importe,
        color: 'none',
        quien: '',
        pendiente: balance || importe,
        paymentHistory: []
    };
    
    // Agregar el registro
    allData[finalCategory].push(newRecord);
    filteredData[finalCategory] = [...allData[finalCategory]];
    
    // Cerrar modal y actualizar vista
    closeAddModal();
    renderTable(finalCategory);
    updateTabCounts();
    
    // Cambiar a la pestaña correcta si es necesaria
    if (currentCategory !== finalCategory) {
        switchTab(finalCategory);
    }
    
    showStatus(`✅ Nuevo registro agregado exitosamente a ${finalCategory}`, 'success');
}

function showStatus(message, type) {
    status.innerHTML = '';
    
    if (type === 'loading') {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 10px;';
        
        const textSpan = document.createElement('span');
        textSpan.textContent = message;
        textSpan.style.cssText = 'display: inline-block;';
        
        const spinner = document.createElement('span');
        spinner.className = 'loading';
        
        container.appendChild(textSpan);
        container.appendChild(spinner);
        status.appendChild(container);
    } else {
        status.textContent = message;
    }
    
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    if (type !== 'loading') {
        setTimeout(() => {
            status.style.display = 'none';
        }, 5000);
    }
}

// Función para validar duplicados (opcional)
function isDuplicateRecord(factura, referencia) {
    for (const category of Object.keys(allData)) {
        for (const record of allData[category]) {
            if (record.factura === factura && record.referencia === referencia) {
                return true;
            }
        }
    }
    return false;
}

function getColorHex(color) {
    switch (color) {
        case 'red': return '#f44336';
        case 'yellow': return '#ffeb3b';
        case 'green': return '#4caf50';
        case 'blue': return '#2196f3';
        case 'orange': return '#ff9800';
        case 'purple': return '#9c27b0';
        default: return '#fff';
    }
}

function updateTabCounts() {
    document.getElementById('serviciosCount').textContent = allData.servicios.length;
    document.getElementById('stockcompCount').textContent = allData.stockcomp.length;
    document.getElementById('stocknumCount').textContent = allData.stocknum.length;
    document.getElementById('otrosCount').textContent = allData.otros.length;
}

function generateRecordKey(record) {
    return `${record.factura}_${record.referencia}`.toLowerCase().trim();
}

function getNewRecords(existingRecords, newRecords) {
    const existingKeys = new Set();
    
    Object.values(existingRecords).forEach(categoryRecords => {
        categoryRecords.forEach(record => {
            existingKeys.add(generateRecordKey(record));
        });
    });
    
    const uniqueNewRecords = newRecords.filter(record => {
        const recordKey = generateRecordKey(record);
        return !existingKeys.has(recordKey);
    });
    
    return uniqueNewRecords;
}

// FIXED: Improved modal cleanup
function showPreviewModal(newRecords) {
    return new Promise((resolve) => {
        const previewModal = document.createElement('div');
        previewModal.className = 'modal';
        previewModal.style.display = 'block';
        
        const categorizedNew = {
            servicios: [],
            stockcomp: [],
            stocknum: [],
            otros: []
        };
        
        newRecords.forEach(record => {
            const category = categorizeRecord(record.referencia);
            categorizedNew[category].push(record);
        });
        
        const totalNew = newRecords.length;
        const breakdown = Object.entries(categorizedNew)
            .map(([cat, records]) => `${cat}: ${records.length}`)
            .join(', ');
        
        previewModal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <h3>🔍 Registros Nuevos Encontrados</h3>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Total de registros nuevos:</strong> ${totalNew}</p>
                    <p><strong>Distribución:</strong> ${breakdown}</p>
                </div>
                
                ${totalNew > 0 ? `
                    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 8px; padding: 10px; margin: 20px 0;">
                        <table style="width: 100%; font-size: 0.85rem;">
                            <thead>
                                <tr style="background: #f1f1f1;">
                                    <th style="padding: 8px;">Factura</th>
                                    <th style="padding: 8px;">Referencia</th>
                                    <th style="padding: 8px;">Fecha</th>
                                    <th style="padding: 8px;">Importe</th>
                                    <th style="padding: 8px;">Categoría</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${newRecords.map(record => `
                                    <tr>
                                        <td style="padding: 8px;">${record.factura}</td>
                                        <td style="padding: 8px;">${record.referencia}</td>
                                        <td style="padding: 8px;">${record.fechaFactura}</td>
                                        <td style="padding: 8px;">${record.importe}</td>
                                        <td style="padding: 8px;">${categorizeRecord(record.referencia)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}
                
                <div class="modal-buttons" style="margin-top: 30px;">
                    <button class="modal-button secondary" id="cancelBtn">
                        ❌ Cancelar
                    </button>
                    ${totalNew > 0 ? `
                        <button class="modal-button primary" id="confirmBtn">
                            ✅ Agregar ${totalNew} registros nuevos
                        </button>
                    ` : `
                        <button class="modal-button primary" id="okBtn">
                            👍 Entendido
                        </button>
                    `}
                </div>
            </div>
        `;
        
        document.body.appendChild(previewModal);
        
        // FIXED: Proper event listener cleanup
        const cancelBtn = previewModal.querySelector('#cancelBtn');
        const confirmBtn = previewModal.querySelector('#confirmBtn');
        const okBtn = previewModal.querySelector('#okBtn');
        
        const cleanup = () => {
            previewModal.remove();
        };
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });
        }
        
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                cleanup();
                resolve(true);
            });
        }
        
        if (okBtn) {
            okBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });
        }
        
        // Click outside to close
        previewModal.addEventListener('click', (e) => {
            if (e.target === previewModal) {
                cleanup();
                resolve(false);
            }
        });
    });
}

function deleteRecord() {
    if (!currentEditingId) return;
    
    const [category, index] = currentEditingId.split('_');
    const record = allData[category][parseInt(index)];
    if (!record) return;

    showDeleteConfirmation(record, category, index);
}

function showDeleteConfirmation(record, category, index) {
    const confirmModal = document.createElement('div');
    confirmModal.className = 'confirm-modal';
    confirmModal.style.display = 'block';
    
    confirmModal.innerHTML = `
        <div class="modal-content">
            <div class="warning-icon">⚠️</div>
            <h3>¿Confirmar eliminación?</h3>
            <p>Esta acción no se puede deshacer. Se eliminará permanentemente:</p>
            
            <div class="record-info">
                <strong>Factura:</strong> ${record.factura}<br>
                <strong>Referencia:</strong> ${record.referencia}<br>
                <strong>Importe:</strong> ${record.importe}<br>
                <strong>Fecha:</strong> ${record.fechaFactura}
            </div>
            
            <div class="modal-buttons">
                <button class="modal-button secondary" onclick="this.closest('.confirm-modal').remove()">
                    Cancelar
                </button>
                <button class="modal-button danger" onclick="confirmDelete('${category}', ${index}); this.closest('.confirm-modal').remove();">
                    🗑️ Sí, eliminar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(confirmModal);
    
    confirmModal.addEventListener('click', function(e) {
        if (e.target === confirmModal) {
            confirmModal.remove();
        }
    });
}

// FIXED: Consistent record ID management
function confirmDelete(category, index) {
    allData[category].splice(index, 1);
    
    // FIXED: Update IDs consistently
    allData[category].forEach((record, newIndex) => {
        record.id = `${category}_${newIndex}`;
    });
    
    filteredData[category] = [...allData[category]];
    renumberAllRecords();
    updateTabCounts();
    renderTable(category);
    closeModal();
    showStatus(`✅ Registro eliminado exitosamente de ${category}`, 'success');
}

function renumberAllRecords() {
    let globalCounter = 1;
    
    ['servicios', 'stockcomp', 'stocknum', 'otros'].forEach(category => {
        allData[category].forEach(record => {
            record.no = globalCounter.toString();
            globalCounter++;
        });
    });
    
    filteredData = JSON.parse(JSON.stringify(allData));
}

function editPayment(paymentIndex) {
    if (!currentEditingId) return;
    
    const [category, index] = currentEditingId.split('_');
    const record = allData[category][parseInt(index)];
    if (!record || !record.paymentHistory || !record.paymentHistory[paymentIndex]) return;
    
    const payment = record.paymentHistory[paymentIndex];
    
    const editModal = document.createElement('div');
    editModal.className = 'edit-payment-modal';
    editModal.style.display = 'block';
    
    editModal.innerHTML = `
        <div class="modal-content">
            <h3>✏️ Editar Pago</h3>
            <div class="form-group">
                <label>Monto del pago:</label>
                <input type="text" id="editPaymentAmount" value="${parseFloat(payment.amount.replace(/,/g, '')).toLocaleString()}" placeholder="0.00">
            </div>
            <div class="form-group">
                <label>¿Quién realizó el pago?:</label>
                <input type="text" id="editPaymentPerson" value="${payment.person}" placeholder="Nombre de la persona">
            </div>
            <div class="form-group">
                <label>Fecha del pago:</label>
                <input type="date" id="editPaymentDate" value="${convertDateToInput(payment.date)}">
            </div>
            <div class="modal-buttons">
                <button class="modal-button secondary" onclick="this.closest('.edit-payment-modal').remove()">
                    Cancelar
                </button>
                <button class="modal-button primary" onclick="savePaymentEdit(${paymentIndex}); this.closest('.edit-payment-modal').remove();">
                    💾 Guardar cambios
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(editModal);
    
    editModal.addEventListener('click', function(e) {
        if (e.target === editModal) {
            editModal.remove();
        }
    });
}

function savePaymentEdit(paymentIndex) {
    if (!currentEditingId) return;
    
    const [category, index] = currentEditingId.split('_');
    const record = allData[category][parseInt(index)];
    if (!record || !record.paymentHistory || !record.paymentHistory[paymentIndex]) return;

    const amountInput = document.getElementById('editPaymentAmount');
    const personInput = document.getElementById('editPaymentPerson');
    const dateInput = document.getElementById('editPaymentDate');
    
    const newAmount = amountInput.value.trim();
    const newPerson = personInput.value.trim();
    const newDate = dateInput.value;

    // ✅ VALIDACIONES
    const amount = parseFloat(newAmount.replace(/,/g, '')) || 0;
    
    if (amount <= 0) {
        amountInput.style.borderColor = '#e74c3c';
        amountInput.style.background = '#ffebee';
        amountInput.focus();
        showStatus('❌ El monto debe ser mayor a 0', 'error');
        return;
    }
    
    if (!newPerson || newPerson.length === 0) {
        personInput.style.borderColor = '#e74c3c';
        personInput.style.background = '#ffebee';
        personInput.focus();
        showStatus('❌ Debes especificar quién realizó el pago', 'error');
        return;
    }

    if (!newDate) {
        dateInput.style.borderColor = '#e74c3c';
        dateInput.style.background = '#ffebee';
        dateInput.focus();
        showStatus('❌ Debes especificar la fecha del pago', 'error');
        return;
    }
    
    record.paymentHistory[paymentIndex] = {
        amount: parseFloat(newAmount.replace(/,/g, '')).toLocaleString(),
        person: newPerson.trim(),
        date: convertInputToDate(newDate)
    };

    // ✅ NUEVO: Recalcular y verificar si debe desacreditar
    const totalPaid = record.paymentHistory.reduce((sum, payment) => {
        return sum + (parseFloat(payment.amount.replace(/,/g, '')) || 0);
    }, 0);
    
    const originalAmount = Math.abs(parseFloat(record.importe.replace(/,/g, '')) || 0);
    const remaining = originalAmount - totalPaid;
    
    // Si ahora hay pendiente y estaba acreditado → desacreditar
    if (remaining > 0.01 && record.credited) {
        record.credited = false;
        record.creditDate = null;
        record.creditReason = null;
        record.creditNotes = null;
        record.creditedBy = null;
        
        showStatus('⚠️ Pago editado. El registro ha sido desacreditado porque aún hay $' + remaining.toFixed(2) + ' pendientes.', 'error');
    } else {
        showStatus('✅ Pago actualizado exitosamente', 'success');
    }
    
    filteredData[category][parseInt(index)] = {...record};
    updateCreditStatus(record);
    loadPaymentHistory(record);
    renderTable(category);
}

function deletePayment(paymentIndex) {
    if (!currentEditingId) return;
    
    const [category, index] = currentEditingId.split('_');
    const record = allData[category][parseInt(index)];
    if (!record || !record.paymentHistory || !record.paymentHistory[paymentIndex]) return;
    
    const payment = record.paymentHistory[paymentIndex];
    
    const confirmModal = document.createElement('div');
    confirmModal.className = 'confirm-modal';
    confirmModal.style.display = 'block';
    
    confirmModal.innerHTML = `
        <div class="modal-content">
            <div class="warning-icon">⚠️</div>
            <h3>¿Eliminar pago?</h3>
            <p>Se eliminará permanentemente este registro de pago:</p>
            
            <div class="record-info">
                <strong>Monto:</strong> $${parseFloat(payment.amount.replace(/,/g, '')).toLocaleString()}<br>
                <strong>Pagado por:</strong> ${payment.person}<br>
                <strong>Fecha:</strong> ${payment.date}
            </div>
            
            <div class="modal-buttons">
                <button class="modal-button secondary" onclick="this.closest('.confirm-modal').remove()">
                    Cancelar
                </button>
                <button class="modal-button danger" onclick="confirmDeletePayment(${paymentIndex}); this.closest('.confirm-modal').remove();">
                    🗑️ Sí, eliminar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(confirmModal);
    
    confirmModal.addEventListener('click', function(e) {
        if (e.target === confirmModal) {
            confirmModal.remove();
        }
    });
}

function confirmDeletePayment(paymentIndex) {
    if (!currentEditingId) return;
    
    const [category, index] = currentEditingId.split('_');
    const record = allData[category][parseInt(index)];
    if (!record || !record.paymentHistory) return;

    const deletedPaymentAmount = parseFloat(record.paymentHistory[paymentIndex].amount.replace(/,/g, '')) || 0;
    
    record.paymentHistory.splice(paymentIndex, 1);

    // Recalcular totales
    const totalPaid = record.paymentHistory.reduce((sum, payment) => {
        return sum + (parseFloat(payment.amount.replace(/,/g, '')) || 0);
    }, 0);
    
    const originalAmount = Math.abs(parseFloat(record.importe.replace(/,/g, '')) || 0);
    const remaining = originalAmount - totalPaid;
    
    // Actualizar campos del record
    record.pago = totalPaid.toLocaleString();
    record.pendiente = remaining.toLocaleString();
    
    // Recalcular balance
    const importeNum = parseFloat(record.importe.replace(/,/g, '')) || 0;
    let newBalance;
    if (importeNum < 0) {
        newBalance = importeNum + totalPaid;
    } else {
        newBalance = importeNum - totalPaid;
    }
    record.balance = newBalance.toLocaleString();

    // ✅ NUEVO: Si ahora hay pendiente y estaba acreditado → desacreditar automáticamente
    if (remaining > 0.01 && record.credited) {
        record.credited = false;
        record.creditDate = null;
        record.creditReason = null;
        record.creditNotes = null;
        record.creditedBy = null;
        
        showStatus('⚠️ Pago eliminado. El registro ha sido desacreditado automáticamente porque aún hay $' + remaining.toFixed(2) + ' pendientes.', 'error');
    } else {
        showStatus('✅ Pago eliminado y totales recalculados', 'success');
    }

    filteredData[category][parseInt(index)] = {...record};
    loadPaymentHistory(record);
    showStatus('✅ Pago eliminado y totales recalculados', 'success');
}

function exportPaymentHistory() {
    if (!currentEditingId) return;
    
    const [category, index] = currentEditingId.split('_');
    const record = allData[category][parseInt(index)];
    if (!record || !record.paymentHistory || record.paymentHistory.length === 0) {
        showStatus('❌ No hay historial de pagos para exportar', 'error');
        return;
    }
    
    const exportData = record.paymentHistory.map(payment => ({
        'Factura': record.factura,
        'Referencia': record.referencia,
        'Importe Original': record.importe,
        'Monto Pago': payment.amount,
        'Pagado Por': payment.person,
        'Fecha Pago': payment.date
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historial Pagos');
    
    const fileName = `historial_pagos_${record.referencia}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showStatus(`📄 Historial exportado como: ${fileName}`, 'success');
}

// Función para validar monto de pago
// REEMPLAZAR toda la función con esta versión mejorada:
function validatePaymentAmount() {
    if (!currentEditingId) return true;
    
    const [category, index] = currentEditingId.split('_');
    const record = allData[category][parseInt(index)];
    if (!record) return true;
    
    const pagoInput = document.getElementById('editPago');
    const rawValue = pagoInput.value.replace(/,/g, '');
    const newPaymentAmount = parseFloat(rawValue) || 0;
    
    if (newPaymentAmount <= 0) return true; // No validar si no hay monto
    
    const originalAmount = Math.abs(parseFloat(record.importe.replace(/,/g, '')) || 0);
    const totalPaid = (record.paymentHistory || []).reduce((sum, payment) => {
        return sum + (parseFloat(payment.amount.replace(/,/g, '')) || 0);
    }, 0);
    
    const maxAllowed = originalAmount - totalPaid;
    
    if (newPaymentAmount > maxAllowed) {
        pagoInput.style.borderColor = '#e74c3c';
        pagoInput.style.background = '#ffebee';
        pagoInput.title = `Máximo permitido: $${maxAllowed.toFixed(2)}`;
        
        // Mostrar mensaje temporal
        const errorMsg = document.createElement('div');
        errorMsg.style.cssText = 'position: absolute; background: #e74c3c; color: white; padding: 5px 10px; border-radius: 4px; font-size: 0.8rem; margin-top: 2px; z-index: 1000;';
        errorMsg.textContent = `⚠️ Máximo: $${maxAllowed.toFixed(2)}`;
        pagoInput.parentElement.style.position = 'relative';
        pagoInput.parentElement.appendChild(errorMsg);
        
        setTimeout(() => errorMsg.remove(), 3000);
        
        return false;
    } else {
        pagoInput.style.borderColor = '#4caf50';
        pagoInput.style.background = '#e8f5e9';
        pagoInput.title = '';
        return true;
    }
}

// Funciones auxiliares para fechas
function convertDateToInput(dateStr) {
    if (!dateStr) return '';
    const date = parseDate(dateStr);
    return date.toISOString().split('T')[0];
}

function convertInputToDate(inputStr) {
    if (!inputStr) return new Date().toLocaleDateString('es-ES');
    const date = new Date(inputStr);
    return date.toLocaleDateString('es-ES');
}

// Función para pagar el total pendiente
function payTotal() {
    if (!currentEditingId) return;
    
    const [category, index] = currentEditingId.split('_');
    const record = allData[category][parseInt(index)];
    if (!record) return;

    const originalAmount = Math.abs(parseFloat(record.importe.replace(/,/g, '')) || 0);
    const totalPaid = (record.paymentHistory || []).reduce((sum, payment) => {
        return sum + (parseFloat(payment.amount.replace(/,/g, '')) || 0);
    }, 0);
    
    const remaining = originalAmount - totalPaid;
    
    if (remaining <= 0) {
        showStatus('⚠️ Este registro ya está pagado completamente', 'error');
        return;
    }

    // Llenar el campo de pago con el monto pendiente
    const pagoInput = document.getElementById('editPago');
    const quienInput = document.getElementById('editQuien');
    
    pagoInput.value = remaining.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    // Focus en el campo de quién para completar el pago
    if (!quienInput.value) {
        quienInput.focus();
        quienInput.placeholder = "¿Quién realizó este pago total?";
    }
    
    // Añadir clase de animación
    pagoInput.classList.add('status-change-animation');
    setTimeout(() => pagoInput.classList.remove('status-change-animation'), 600);
    
    showStatus(`💰 Listo para pagar total: $${remaining.toLocaleString()}`, 'success');
}

// Función para pagos rápidos por porcentaje
function quickPayment(percentage) {
    if (!currentEditingId) return;
    
    const [category, index] = currentEditingId.split('_');
    const record = allData[category][parseInt(index)];
    if (!record) return;

    const originalAmount = Math.abs(parseFloat(record.importe.replace(/,/g, '')) || 0);
    const totalPaid = (record.paymentHistory || []).reduce((sum, payment) => {
        return sum + (parseFloat(payment.amount.replace(/,/g, '')) || 0);
    }, 0);
    
    const remaining = originalAmount - totalPaid;
    const paymentAmount = remaining * percentage;
    
    if (remaining <= 0) {
        showStatus('⚠️ Este registro ya está pagado completamente', 'error');
        return;
    }

    const pagoInput = document.getElementById('editPago');
    const quienInput = document.getElementById('editQuien');
    
    pagoInput.value = paymentAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    // Focus en el campo de quién
    if (!quienInput.value) {
        quienInput.focus();
        quienInput.placeholder = `¿Quién pagó el ${(percentage * 100)}%?`;
    }
    
    // Añadir clase de animación
    pagoInput.classList.add('status-change-animation');
    setTimeout(() => pagoInput.classList.remove('status-change-animation'), 600);
    
    const percentageText = percentage === 1 ? "total" : `${(percentage * 100)}%`;
    showStatus(`⚡ Pago ${percentageText}: $${paymentAmount.toLocaleString()}`, 'success');
}

// Función para acreditar un registro
function creditRecord() {
    if (!currentEditingId) return;
    
    const [category, index] = currentEditingId.split('_');
    const record = allData[category][parseInt(index)];
    if (!record) return;

    // Verificar si ya está acreditado
    if (record.credited) {
        // Desacreditar
        record.credited = false;
        record.creditDate = null;
        record.creditedBy = null;
        updateCreditStatus(record);
        showStatus('🔄 Registro desacreditado', 'success');
    } else {
        // Mostrar modal de confirmación para acreditar
        showCreditConfirmationModal(record);
    }
}

// Función para mostrar modal de confirmación de acreditación
function showCreditConfirmationModal(record) {
    const originalAmount = Math.abs(parseFloat(record.importe.replace(/,/g, '')) || 0);
    const totalPaid = (record.paymentHistory || []).reduce((sum, payment) => {
        return sum + (parseFloat(payment.amount.replace(/,/g, '')) || 0);
    }, 0);
    
    const remaining = Math.max(0, originalAmount - totalPaid); // ✅ Asegurar que no sea negativo
    const isFullyPaid = remaining <= 0.01; // ✅ Tolerancia para centavos

    const confirmModal = document.createElement('div');
    confirmModal.className = 'modal';
    confirmModal.style.display = 'block';
    
    confirmModal.innerHTML = `
        <div class="modal-content">
            <h3>✅ Acreditar Registro</h3>
            <div class="credit-info">
                <p><strong>Factura:</strong> ${record.factura}</p>
                <p><strong>Referencia:</strong> ${record.referencia}</p>
                <p><strong>Importe original:</strong> $${originalAmount.toLocaleString()}</p>
                <p><strong>Total pagado:</strong> $${totalPaid.toLocaleString()}</p>
                <p><strong>Pendiente:</strong> $${remaining.toLocaleString()}</p>
            </div>
            
            ${!isFullyPaid && remaining > 0.01 ? `
                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ffc107;">
                    <strong>⚠️ Atención:</strong> Este registro aún tiene $${remaining.toFixed(2)} pendientes de pago.
                    <br>¿Deseas acreditarlo como pagado completamente?
                </div>
            ` : `
                <div style="background: var(--verde-claro); padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid var(--verde);">
                    <strong>✅ Perfecto:</strong> Este registro está completamente pagado y listo para acreditar.
                </div>
            `}
            
            <div class="form-group">
                <label>Motivo de acreditación:</label>
                <select id="creditReason" style="width: 100%; padding: 10px; border: 2px solid var(--gris); border-radius: 8px;">
                    <option value="paid">Pagado completamente</option>
                    <option value="forgiven">Deuda condonada</option>
                    <option value="transferred">Transferido a otra cuenta</option>
                    <option value="error">Error en facturación</option>
                    <option value="other">Otro motivo</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>Notas adicionales (opcional):</label>
                <textarea id="creditNotes" placeholder="Agregar comentarios sobre esta acreditación..." 
                    style="width: 100%; padding: 10px; border: 2px solid var(--gris); border-radius: 8px; min-height: 80px;"></textarea>
            </div>
            
            <div class="modal-buttons">
                <button class="modal-button secondary" onclick="this.closest('.modal').remove()">
                    Cancelar
                </button>
                <button class="modal-button primary" onclick="confirmCredit(); this.closest('.modal').remove();">
                    ✅ Acreditar registro
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(confirmModal);
    
    confirmModal.addEventListener('click', function(e) {
        if (e.target === confirmModal) {
            confirmModal.remove();
        }
    });
}

// FIXED: Consistent overpayment validation
function confirmCredit() {
    if (!currentEditingId) return;
    
    const [category, index] = currentEditingId.split('_');
    const record = allData[category][parseInt(index)];
    if (!record) return;

    const reason = document.getElementById('creditReason').value;
    const notes = document.getElementById('creditNotes').value;
    
    // Marcar como acreditado
    record.credited = true;
    record.creditDate = new Date().toLocaleDateString('es-ES');
    record.creditReason = reason;
    record.creditNotes = notes || '';
    record.creditedBy = "Sistema";
    
    // FIXED: Consistent validation before auto-payment
    const originalAmount = Math.abs(parseFloat(record.importe.replace(/,/g, '')) || 0);
    const totalPaid = (record.paymentHistory || []).reduce((sum, payment) => {
        return sum + (parseFloat(payment.amount.replace(/,/g, '')) || 0);
    }, 0);
    
    if (totalPaid < originalAmount) {
        const remaining = originalAmount - totalPaid;
        
        // Add validation check before auto-payment
        if (remaining > 0) {
            if (!record.paymentHistory) record.paymentHistory = [];
            record.paymentHistory.push({
                amount: remaining.toLocaleString(),
                person: "Sistema (Acreditación)",
                date: new Date().toLocaleDateString('es-ES'),
                type: "credited",
                reason: reason,
                notes: notes
            });
            
            // Update totals with consistent calculation
            const importeOriginal = parseFloat(record.importe.replace(/,/g, '')) || 0;
            record.pago = originalAmount.toLocaleString();

            // ✅ CORRECCIÓN: Balance correcto al acreditar
            let newBalance;
            if (importeOriginal > 0) {
                // Pago completamente realizado: 2000 - 2000 = 0
                newBalance = importeOriginal - originalAmount;
            } else {
                // Valores negativos: -2000 + 2000 = 0
                newBalance = importeOriginal + originalAmount;
            }
            record.balance = newBalance.toLocaleString();
        }
    }
    
    filteredData[category][parseInt(index)] = {...record};
    
    updateCreditStatus(record);
    loadPaymentHistory(record);
    renderTable(category);
    
    showStatus(`✅ Registro acreditado exitosamente por motivo: ${getCreditReasonText(reason)}`, 'success');

    // ✅ Cerrar el modal de edición después de acreditar
    setTimeout(() => {
        closeModal();
    }, 1500);
}

// Función para obtener texto del motivo de acreditación
function getCreditReasonText(reason) {
    const reasons = {
        'paid': 'Pagado completamente',
        'forgiven': 'Deuda condonada',
        'transferred': 'Transferido a otra cuenta',
        'error': 'Error en facturación',
        'other': 'Otro motivo'
    };
    return reasons[reason] || reason;
}

// Función para actualizar el estado de acreditación en la interfaz
function updateCreditStatus(record) {
    const statusIndicator = document.getElementById('paymentStatusIndicator');
    const statusText = document.getElementById('paymentStatusText');
    const creditButton = document.getElementById('creditButton');
    
    if (!statusIndicator || !statusText || !creditButton) return;

    // Calcular estado de pago
    const originalAmount = Math.abs(parseFloat(record.importe.replace(/,/g, '')) || 0);
    const totalPaid = (record.paymentHistory || []).reduce((sum, payment) => {
        return sum + (parseFloat(payment.amount.replace(/,/g, '')) || 0);
    }, 0);
    
    const remaining = originalAmount - totalPaid;
    const paymentPercentage = originalAmount > 0 ? (totalPaid / originalAmount) : 0;
    const isFullyPaid = remaining <= 0.01; // Tolerancia para centavos

    if (record.credited) {
        // Estado: Acreditado
        statusIndicator.className = 'status-indicator credited';
        statusText.textContent = `Acreditado (${record.creditDate})`;
        statusIndicator.querySelector('.status-icon').textContent = '✅';
        
        creditButton.textContent = '🔄 Desacreditar';
        creditButton.className = 'credit-btn credited';
        creditButton.title = 'Revertir acreditación';
        creditButton.style.display = 'inline-block';
        
    } else if (isFullyPaid) {
        // ✅ Estado: Pagado completamente - MOSTRAR botón de acreditar
        statusIndicator.className = 'status-indicator paid';
        statusText.textContent = 'Pagado completamente';
        statusIndicator.querySelector('.status-icon').textContent = '💚';
        
        creditButton.textContent = '✅ Acreditar';
        creditButton.className = 'credit-btn';
        creditButton.title = 'Marcar como acreditado';
        creditButton.style.display = 'inline-block'; // ✅ MOSTRAR

    } else if (totalPaid > 0) {
        // ⏳ Estado: Pagado parcialmente - OCULTAR botón
        statusIndicator.className = 'status-indicator partial';
        statusText.textContent = `Pagado ${(paymentPercentage * 100).toFixed(1)}%`;
        statusIndicator.querySelector('.status-icon').textContent = '🔵';
        
        creditButton.style.display = 'none'; // ✅ OCULTAR botón

    } else {
        // ⏳ Estado: Pendiente - OCULTAR botón
        statusIndicator.className = 'status-indicator pending';
        statusText.textContent = 'Pendiente de pago';
        statusIndicator.querySelector('.status-icon').textContent = '⏳';
        
        creditButton.style.display = 'none'; // ✅ OCULTAR botón
    }
}

// ✅ ÚNICO evento DOMContentLoaded consolidado
document.addEventListener('DOMContentLoaded', function() {
    resetOptionsToDefault();

    const globalExportButton = document.getElementById('globalExportButton');
    if (globalExportButton) {
        globalExportButton.addEventListener('click', exportGlobalExcel);
    }

    const exportBySourceButton = document.getElementById('exportBySourceButton');
    if (exportBySourceButton) {
        exportBySourceButton.addEventListener('click', exportBySourceFiles);
    }
    
    // Verificar elementos requeridos
    const requiredElements = [
        'fileInput', 'passwordInput', 'processButton', 'dataSection', 'status', 'fileName',
        'editModal', 'editPago', 'editQuien'
    ];
    
    const missingElements = requiredElements.filter(id => !document.getElementById(id));
    if (missingElements.length > 0) {
        console.error('Faltan elementos:', missingElements);
    }

    // Event listeners de modales
    const addModal = document.getElementById('addModal');
    const editModal = document.getElementById('editModal');
    
    if (addModal) {
        addModal.addEventListener('click', function(e) {
            if (e.target === this) closeAddModal();
        });
    }
    
    if (editModal) {
        editModal.addEventListener('click', function(e) {
            if (e.target === this) closeModal();
        });
    }
    
    // Tecla Escape para cerrar modales
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (addModal && addModal.style.display === 'block') closeAddModal();
            if (editModal && editModal.style.display === 'block') closeModal();
        }
    });
    
    // Enter en formulario de agregar
    ['addTipo', 'addFactura', 'addReferencia', 'addFechaFactura', 'addFechaVencimiento', 'addImporte', 'addPago', 'addBalance'].forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveNewRecord();
                }
            });
        }
    });
    
    // Auto-completar campos
    const addImporte = document.getElementById('addImporte');
    const addFechaFactura = document.getElementById('addFechaFactura');
    
    if (addImporte) {
        addImporte.addEventListener('input', function() {
            const importeValue = this.value.trim();
            const balanceInput = document.getElementById('addBalance');
            if (importeValue && balanceInput && !balanceInput.value) {
                balanceInput.value = importeValue;
            }
        });
    }
    
    if (addFechaFactura) {
        addFechaFactura.addEventListener('input', function() {
            const fechaFactura = this.value.trim();
            const fechaVencimientoInput = document.getElementById('addFechaVencimiento');
            if (fechaFactura && fechaVencimientoInput && !fechaVencimientoInput.value) {
                fechaVencimientoInput.value = fechaFactura;
            }
        });
    }

    // ✅ Manejo del campo de pago con decimales
    const pagoInput = document.getElementById('editPago');
    if (pagoInput) {
        // Input: permitir solo números y punto decimal
        pagoInput.addEventListener('input', function(e) {
            let value = this.value;
            value = value.replace(/[^\d.,]/g, '');
            value = value.replace(/,/g, '');
            
            const parts = value.split('.');
            if (parts.length > 2) {
                value = parts[0] + '.' + parts.slice(1).join('');
            }
            
            if (parts.length === 2 && parts[1].length > 2) {
                value = parts[0] + '.' + parts[1].substring(0, 2);
            }
            
            this.value = value;
            validatePaymentAmount(); // Validar mientras escribe
        });
        
        // Blur: formatear con comas
        pagoInput.addEventListener('blur', function() {
            const value = parseFloat(this.value.replace(/,/g, ''));
            
            if (!isNaN(value) && value > 0) {
                this.value = value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            } else {
                this.value = '';
                this.placeholder = '0.00';
            }
        });
        
        // Focus: limpiar formato
        pagoInput.addEventListener('focus', function() {
            if (this.value === '' || this.value === '0' || this.value === '0.00') {
                this.value = '';
            } else {
                const value = this.value.replace(/,/g, '');
                this.value = value;
            }
        });
    }
    
    // Password input styling
    passwordInput.addEventListener('input', function() {
        const hasPassword = this.value.trim().length > 0;
        
        if (hasPassword) {
            this.style.borderColor = '#4caf50';
            this.style.background = '#e8f5e9';
        } else {
            this.style.borderColor = '';
            this.style.background = '';
        }
    });
    
    // Doble click para mostrar/ocultar contraseña
    passwordInput.addEventListener('dblclick', function() {
        this.type = this.type === 'password' ? 'text' : 'password';
    });
});

// ==================== EXPORTACIÓN GLOBAL ==================== 
async function exportGlobalExcel() {
    try {
        // Verificar que hay datos
        const totalRecords = Object.values(allData).reduce((sum, arr) => sum + arr.length, 0);
        
        if (totalRecords === 0) {
            showStatus('❌ No hay datos para exportar', 'error');
            return;
        }

        // Preguntar si quiere proteger con contraseña
        const password = prompt('🔐 ¿Deseas proteger el Excel con contraseña?\n\n(Dejar vacío para NO proteger)\n\nNOTA: Recuerda esta contraseña, la necesitarás para abrir el archivo.');

        if (password === null) {
            showStatus('❌ Exportación cancelada', 'error');
            return;
        }

        showStatus('📊 Generando Excel completo...', 'loading');

        // Determinar estado de cada registro
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const warningDate = new Date(today);
        warningDate.setDate(warningDate.getDate() + 7);

        // Combinar todos los registros en orden
        const allRecords = [
            ...allData.servicios,
            ...allData.stockcomp,
            ...allData.stocknum,
            ...allData.otros
        ].sort((a, b) => parseInt(a.no) - parseInt(b.no));

        // Preparar datos con colores
        const dataToExport = allRecords.map(record => {
            let fillColor = null;
            
            if (record.credited) {
                fillColor = 'FFE8F5E9'; // Verde
            } else {
                const vencimiento = parseDate(record.fechaVencimiento);
                
                if (vencimiento < today) {
                    fillColor = 'FFFFEBEE'; // Rojo
                } else if (vencimiento <= warningDate) {
                    fillColor = 'FFFFF9C4'; // Amarillo
                }
            }

            return {
                no: record.no,
                tipo: record.tipo,
                factura: record.factura,
                referencia: record.referencia,
                fechaFactura: record.fechaFactura,
                fechaVencimiento: record.fechaVencimiento,
                moneda: record.moneda,
                importe: record.importe,
                pago: record.pago,
                balance: record.balance,
                fillColor: fillColor
            };
        });

        // Enviar al servidor
        const response = await fetch(`${API_URL}/api/export-excel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: dataToExport,
                password: password || ''
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error en el servidor');
        }

        // Descargar archivo
        const blob = await response.blob();
        const fileName = `facturas_completas_${new Date().toISOString().split('T')[0]}.xlsx`;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        const protectionMsg = password 
            ? `🔐 Excel protegido con contraseña` 
            : `📄 Excel sin protección`;

        showStatus(`✅ ${protectionMsg}: ${fileName} (${totalRecords} registros)`, 'success');

    } catch (error) {
        console.error('Error exportando Excel:', error);
        
        if (error.message.includes('Python')) {
            showStatus('❌ Error: Python no está disponible. El archivo se descargará sin contraseña.', 'error');
        } else {
            showStatus('❌ Error al exportar: ' + error.message, 'error');
        }
    }
}

// ==================== EXPORTACIÓN POR ARCHIVOS DE ORIGEN ==================== 
async function exportBySourceFiles() {
    try {
        // Verificar que hay datos
        const totalRecords = Object.values(allData).reduce((sum, arr) => sum + arr.length, 0);
        
        if (totalRecords === 0) {
            showStatus('❌ No hay datos para exportar', 'error');
            return;
        }

        // Agrupar registros por archivo de origen
        const recordsByFile = {};
        
        ['servicios', 'stockcomp', 'stocknum', 'otros'].forEach(category => {
            allData[category].forEach(record => {
                const fileId = record.sourceFileId || 'unknown';
                const fileName = record.sourceFile || 'registros_manuales.xlsx';
                
                if (!recordsByFile[fileId]) {
                    recordsByFile[fileId] = {
                        fileName: fileName,
                        records: []
                    };
                }
                
                recordsByFile[fileId].records.push(record);
            });
        });

        const fileCount = Object.keys(recordsByFile).length;
        
        if (fileCount === 0) {
            showStatus('❌ No se encontraron archivos de origen', 'error');
            return;
        }

        // Si solo hay un archivo, exportar directamente
        if (fileCount === 1) {
            const fileData = Object.values(recordsByFile)[0];
            showStatus(`📊 Exportando ${fileData.records.length} registros de "${fileData.fileName}"...`, 'loading');
            await exportSingleFile(fileData.fileName, fileData.records);
            return;
        }

        // Si hay múltiples archivos, preguntar si quiere ZIP o individual
        const exportAll = confirm(
            `📁 Se encontraron ${fileCount} archivos de origen con un total de ${totalRecords} registros.\n\n` +
            `¿Deseas exportar todos como archivos separados?\n\n` +
            `• OK = Exportar todos (descarga múltiple)\n` +
            `• Cancelar = Elegir archivo específico`
        );

        if (exportAll) {
            // Exportar todos los archivos
            showStatus(`📦 Generando ${fileCount} archivos Excel...`, 'loading');
            
            let exported = 0;
            let cancelled = 0;
            
            for (const [fileId, fileData] of Object.entries(recordsByFile)) {
                try {
                    await exportSingleFile(fileData.fileName, fileData.records);
                    exported++;
                    
                    // Pequeña pausa entre descargas para evitar bloqueo del navegador
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    if (error.message.includes('cancelada')) {
                        cancelled++;
                        console.log(`⏭️ Saltando "${fileData.fileName}"`);
                        // Continuar con el siguiente archivo
                        continue;
                    } else {
                        // Si es otro tipo de error, lanzarlo
                        throw error;
                    }
                }
            }
            
            if (exported > 0 && cancelled > 0) {
                showStatus(`✅ ${exported} archivos exportados, ${cancelled} cancelados`, 'success');
            } else if (exported > 0) {
                showStatus(`✅ ${exported} archivos exportados exitosamente`, 'success');
            } else {
                showStatus(`⚠️ Todas las exportaciones fueron canceladas`, 'error');
            }
            
        } else {
            // Mostrar selector de archivo
            showFileSelector(recordsByFile);
        }

    } catch (error) {
        console.error('Error exportando por archivos:', error);
        showStatus('❌ Error al exportar: ' + error.message, 'error');
    }
}

// Función auxiliar para exportar un solo archivo
async function exportSingleFile(originalFileName, records) {
    try {
        // Preguntar si quiere proteger con contraseña
        const password = prompt(
            `🔐 Proteger "${originalFileName}" con contraseña?\n\n` +
            `(Dejar vacío para NO proteger)`
        );

        if (password === null) {
            console.log(`⚠️ Exportación de "${originalFileName}" cancelada por el usuario`);
            throw new Error('Exportación cancelada por el usuario');
        }

        // Determinar estado de cada registro
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const warningDate = new Date(today);
        warningDate.setDate(warningDate.getDate() + 7);

        // Ordenar registros
        const sortedRecords = records.sort((a, b) => parseInt(a.no) - parseInt(b.no));

        // Preparar datos con colores
        const dataToExport = sortedRecords.map(record => {
            let fillColor = null;
            
            if (record.credited) {
                fillColor = 'FFE8F5E9';
            } else {
                const vencimiento = parseDate(record.fechaVencimiento);
                
                if (vencimiento < today) {
                    fillColor = 'FFFFEBEE';
                } else if (vencimiento <= warningDate) {
                    fillColor = 'FFFFF9C4';
                }
            }

            return {
                no: record.no,
                tipo: record.tipo,
                factura: record.factura,
                referencia: record.referencia,
                fechaFactura: record.fechaFactura,
                fechaVencimiento: record.fechaVencimiento,
                moneda: record.moneda,
                importe: record.importe,
                pago: record.pago,
                balance: record.balance,
                fillColor: fillColor
            };
        });

        // Enviar al servidor
        const response = await fetch(`${API_URL}/api/export-excel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: dataToExport,
                password: password || '',
                originalFileName: originalFileName
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error en el servidor');
        }

        // Descargar archivo
        const blob = await response.blob();
        const exportFileName = originalFileName.replace('.xlsx', '') + 
            `_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        const protectionMsg = password ? `🔐 Protegido` : `📄 Sin protección`;
        console.log(`✅ ${protectionMsg}: ${exportFileName} (${records.length} registros)`);

    } catch (error) {
        throw new Error(`Error exportando "${originalFileName}": ${error.message}`);
    }
}

// Selector de archivo específico
function showFileSelector(recordsByFile) {
    const selectorModal = document.createElement('div');
    selectorModal.className = 'modal';
    selectorModal.style.display = 'block';
    
    const fileList = Object.entries(recordsByFile)
        .map(([fileId, fileData]) => `
            <div class="file-selector-item" onclick="selectFileToExport('${fileId}')">
                <div class="file-icon">📄</div>
                <div class="file-info">
                    <div class="file-name">${fileData.fileName}</div>
                    <div class="file-stats">${fileData.records.length} registros</div>
                </div>
            </div>
        `).join('');
    
    selectorModal.innerHTML = `
        <div class="modal-content">
            <h3>📁 Selecciona el archivo a exportar</h3>
            <div class="file-selector-list">
                ${fileList}
            </div>
            <div class="modal-buttons">
                <button class="modal-button secondary" onclick="this.closest('.modal').remove()">
                    Cancelar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(selectorModal);
    
    // Guardar referencia global para la función selectFileToExport
    window.currentRecordsByFile = recordsByFile;
    
    selectorModal.addEventListener('click', function(e) {
        if (e.target === selectorModal) {
            selectorModal.remove();
            delete window.currentRecordsByFile;
        }
    });
}

// Función para seleccionar y exportar archivo específico
async function selectFileToExport(fileId) {
    const recordsByFile = window.currentRecordsByFile;
    const fileData = recordsByFile[fileId];
    
    if (!fileData) return;
    
    // Cerrar modal
    document.querySelector('.modal').remove();
    delete window.currentRecordsByFile;
    
    // Exportar
    showStatus(`📊 Exportando "${fileData.fileName}"...`, 'loading');
    await exportSingleFile(fileData.fileName, fileData.records);
    showStatus(`✅ Archivo "${fileData.fileName}" exportado exitosamente`, 'success');
}

// Hacer funciones globales
window.addNewRecord = addNewRecord;
window.closeAddModal = closeAddModal;
window.saveNewRecord = saveNewRecord;
window.deleteRecord = deleteRecord;
window.confirmDelete = confirmDelete;
window.openEditModal = openEditModal;
window.closeModal = closeModal;
window.saveEdit = saveEdit;
window.showManualEntry = showManualEntry;
window.editPayment = editPayment;
window.deletePayment = deletePayment;
window.savePaymentEdit = savePaymentEdit;
window.confirmDeletePayment = confirmDeletePayment;
window.exportPaymentHistory = exportPaymentHistory;
window.payTotal = payTotal;
window.quickPayment = quickPayment;
window.creditRecord = creditRecord;
window.confirmCredit = confirmCredit;
window.exportGlobalExcel = exportGlobalExcel;
window.exportBySourceFiles = exportBySourceFiles;
window.selectFileToExport = selectFileToExport;