let allData = {
    creditos: [],
    servicios: [],
    stock: [],
    otros: []
};
let filteredData = {
    creditos: [],
    servicios: [],
    stock: [],
    otros: []
};
let currentEditingId = null;
let currentCategory = 'creditos';

const fileInput = document.getElementById('fileInput');
const passwordInput = document.getElementById('passwordInput');
const processButton = document.getElementById('processButton');
const dataSection = document.getElementById('dataSection');
const status = document.getElementById('status');
const fileName = document.getElementById('fileName');

// Event listeners para las pestañas
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
        const category = this.dataset.category;
        switchTab(category);
    });
});

// Event listeners para cada categoría
['creditos', 'servicios', 'stock', 'otros'].forEach(category => {
    const searchInput = document.getElementById(`searchInput${category.charAt(0).toUpperCase() + category.slice(1)}`);
    const saveButton = document.getElementById(`saveButton${category.charAt(0).toUpperCase() + category.slice(1)}`);
    const addButton = document.getElementById(`addButton${category.charAt(0).toUpperCase() + category.slice(1)}`);
    
    if (searchInput) searchInput.addEventListener('input', () => filterData(category));
    if (saveButton) saveButton.addEventListener('click', () => saveData(category));
    if (addButton) addButton.addEventListener('click', () => addNewRecord(category));
});

fileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        fileName.textContent = `Archivo seleccionado: ${e.target.files[0].name}`;
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
    const ref = referencia.toUpperCase();
    if (ref.startsWith('ESIN')) return 'creditos';
    if (ref.startsWith('RNN')) return 'servicios';
    if (ref.startsWith('STOCK')) return 'stock';
    return 'otros';
}

async function processFile() {
    const file = fileInput.files[0];
    const password = passwordInput.value;

    if (!file) {
        showStatus('Por favor selecciona un archivo', 'error');
        return;
    }

    showStatus('Procesando archivo...', 'loading');
    processButton.disabled = true;

    try {
        const fileName = file.name.toLowerCase();
        let jsonData = [];

        if (fileName.endsWith('.csv')) {
            const text = await file.text();
            const results = Papa.parse(text, {
                header: false,
                skipEmptyLines: true,
                dynamicTyping: true
            });
            jsonData = results.data;
            showStatus('Archivo CSV procesado exitosamente', 'success');
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            const arrayBuffer = await file.arrayBuffer();
            let workbook;

            const readAttempts = [
                () => XLSX.read(arrayBuffer, { type: 'array' }),
                () => XLSX.read(arrayBuffer, { type: 'array', password: password }),
                () => XLSX.read(arrayBuffer, { type: 'array', cellFormula: false }),
                () => XLSX.read(arrayBuffer, { type: 'array', cellHTML: false }),
                () => XLSX.read(arrayBuffer, { type: 'array', raw: true })
            ];

            let lastError;
            for (let i = 0; i < readAttempts.length; i++) {
                try {
                    workbook = readAttempts[i]();
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                        header: 1,
                        defval: '',
                        raw: false
                    });
                    
                    if (jsonData && jsonData.length > 0) {
                        showStatus(`Archivo Excel procesado exitosamente (método ${i + 1})`, 'success');
                        break;
                    }
                } catch (error) {
                    lastError = error;
                }
            }

            if (!jsonData || jsonData.length === 0) {
                throw new Error(`No se pudo leer el archivo después de ${readAttempts.length} intentos. Último error: ${lastError?.message}`);
            }
        } else {
            throw new Error('Formato de archivo no soportado. Use .xlsx, .xls o .csv');
        }

        if (!jsonData || jsonData.length < 1) {
            showStatus('El archivo está vacío o no contiene datos válidos', 'error');
            processButton.disabled = false;
            return;
        }

        if (jsonData.length === 1) {
            showStatus('Solo se encontró la cabecera. Agregando datos de ejemplo...', 'success');
            jsonData.push(
                [1, 'CM', 'ESCN0311063', 'ESIN1003196', '12/05/2025', '12/05/2025', 'MXN', '-2,034.62', '0', '-2,034.62'],
                [2, 'CM', 'ESCN0311064', 'ESIN1012970', '12/05/2025', '12/05/2025', 'MXN', '-3,286.29', '0', '-3,286.29'],
                [3, 'CM', 'ESCN0311068', 'RNN0997105', '13/05/2025', '13/05/2025', 'MXN', '-3,600.85', '0', '-3,600.85'],
                [4, 'CM', 'ESCN0311069', 'STOCK001234', '13/05/2025', '13/05/2025', 'MXN', '-1,500.00', '0', '-1,500.00'],
                [5, 'CM', 'ESCN0311070', 'OTROS123456', '13/05/2025', '13/05/2025', 'MXN', '-2,200.00', '0', '-2,200.00']
            );
        }

        // Limpiar datos existentes
        allData = {
            creditos: [],
            servicios: [],
            stock: [],
            otros: []
        };

        // Procesar los datos y categorizarlos
        const dataRows = jsonData.length > 1 ? jsonData.slice(1) : jsonData;
        dataRows.forEach((row, index) => {
            const record = {
                id: index,
                no: (row[0] || index + 1).toString(),
                tipo: (row[1] || '').toString(),
                factura: (row[2] || '').toString(),
                referencia: (row[3] || '').toString(),
                fechaFactura: (row[4] || '').toString(),
                fechaVencimiento: (row[5] || '').toString(),
                moneda: (row[6] || 'MXN').toString(),
                importe: (row[7] || '0').toString(),
                pago: (row[8] || '0').toString(),
                balance: (row[9] || '0').toString(),
                // Nuevos campos
                color: 'none',
                quien: '',
                pendiente: (row[9] || '0').toString()
            };

            const category = categorizeRecord(record.referencia);
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
        
        // Mostrar la primera pestaña con datos
        const firstCategoryWithData = Object.keys(allData).find(cat => allData[cat].length > 0) || 'creditos';
        switchTab(firstCategoryWithData);
        
        dataSection.style.display = 'block';
        
        const totalRecords = Object.values(allData).reduce((sum, arr) => sum + arr.length, 0);
        showStatus(`Archivo procesado exitosamente. ${totalRecords} registros categorizados: Créditos(${allData.creditos.length}), Servicios(${allData.servicios.length}), Stock(${allData.stock.length}), Otros(${allData.otros.length})`, 'success');
        
    } catch (error) {
        console.error('Error completo:', error);
        showStatus(`
            <div>
                <p><strong>No se pudo procesar el archivo</strong></p>
                <p><strong>Error:</strong> ${error.message}</p>
                <div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; text-align: left;">
                    <p><strong>💡 Soluciones recomendadas:</strong></p>
                    <ol style="margin: 10px 0; padding-left: 20px;">
                        <li><strong>Convertir a CSV:</strong> Abre el archivo en Excel y guarda como "CSV (delimitado por comas)"</li>
                        <li><strong>Quitar protección:</strong> En Excel: Archivo → Información → Proteger libro → Quitar contraseña</li>
                        <li><strong>Usar datos de ejemplo:</strong> Haz clic en el botón de abajo para comenzar</li>
                        <li><strong>Verificar el archivo:</strong> Asegúrate de que no esté corrupto</li>
                    </ol>
                </div>
                <button onclick="showManualEntry()" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    🚀 Usar datos de ejemplo
                </button>
            </div>
        `, 'error');
        processButton.disabled = false;
    }
}

function showManualEntry() {
    // Crear datos de ejemplo categorizados
    allData = {
        creditos: [
            {
                id: 'creditos_0',
                no: '1',
                tipo: 'CM',
                factura: 'ESCN0311063',
                referencia: 'ESIN1003196',
                fechaFactura: '12/05/2025',
                fechaVencimiento: '12/05/2025',
                moneda: 'MXN',
                importe: '-2,034.62',
                pago: '0',
                balance: '-2,034.62',
                color: 'none',
                quien: '',
                pendiente: '-2,034.62'
            },
            {
                id: 'creditos_1',
                no: '2',
                tipo: 'CM',
                factura: 'ESCN0311064',
                referencia: 'ESIN1012970',
                fechaFactura: '12/05/2025',
                fechaVencimiento: '12/05/2025',
                moneda: 'MXN',
                importe: '-3,286.29',
                pago: '0',
                balance: '-3,286.29',
                color: 'none',
                quien: '',
                pendiente: '-3,286.29'
            }
        ],
        servicios: [
            {
                id: 'servicios_0',
                no: '3',
                tipo: 'CM',
                factura: 'ESCN0311068',
                referencia: 'RNN0997105',
                fechaFactura: '13/05/2025',
                fechaVencimiento: '13/05/2025',
                moneda: 'MXN',
                importe: '-3,600.85',
                pago: '0',
                balance: '-3,600.85',
                color: 'none',
                quien: '',
                pendiente: '-3,600.85'
            }
        ],
        stock: [
            {
                id: 'stock_0',
                no: '4',
                tipo: 'CM',
                factura: 'ESCN0311069',
                referencia: 'STOCK001234',
                fechaFactura: '13/05/2025',
                fechaVencimiento: '13/05/2025',
                moneda: 'MXN',
                importe: '-1,500.00',
                pago: '0',
                balance: '-1,500.00',
                color: 'none',
                quien: '',
                pendiente: '-1,500.00'
            }
        ],
        otros: [
            {
                id: 'otros_0',
                no: '5',
                tipo: 'CM',
                factura: 'ESCN0311070',
                referencia: 'OTROS123456',
                fechaFactura: '13/05/2025',
                fechaVencimiento: '13/05/2025',
                moneda: 'MXN',
                importe: '-2,200.00',
                pago: '0',
                balance: '-2,200.00',
                color: 'none',
                quien: '',
                pendiente: '-2,200.00'
            }
        ]
    };

    filteredData = JSON.parse(JSON.stringify(allData));
    switchTab('creditos');
    dataSection.style.display = 'block';
    showStatus('Datos de ejemplo cargados y categorizados. Puedes editarlos y agregar más registros.', 'success');
}

function renderTable(category = currentCategory) {
    const tableBody = document.getElementById(`tableBody${category.charAt(0).toUpperCase() + category.slice(1)}`);
    const recordCount = document.getElementById(`recordCount${category.charAt(0).toUpperCase() + category.slice(1)}`);
    
    if (!tableBody) return;

    tableBody.innerHTML = '';
    
    filteredData[category].forEach((row) => {
        const tr = document.createElement('tr');

        // Asigna la clase de color a la fila si tiene color
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
            <td class="money ${parseFloat(row.importe.replace(/,/g, '')) < 0 ? 'negative' : 'positive'}">
                <input type="text" class="editable" value="${row.importe}" data-field="importe" data-id="${row.id}">
            </td>
            <td class="money">
                <input type="text" class="editable" value="${row.pago}" data-field="pago" data-id="${row.id}">
            </td>
            <td class="money ${parseFloat(row.balance.replace(/,/g, '')) < 0 ? 'negative' : 'positive'}">
                <input type="text" class="editable" value="${row.balance}" data-field="balance" data-id="${row.id}">
            </td>
            <td>
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="display:inline-block;width:18px;height:18px;border-radius:50%;border:1.5px solid #bbb;${row.color && row.color !== 'none' ? `background:${getColorHex(row.color)};` : 'background: repeating-linear-gradient(45deg, #fff 0 4px, #eee 4px 8px);'}"></span>
                    <button class="modal-button secondary" style="padding:4px 10px;font-size:1rem;" onclick="openEditModal('${row.id}')">✏️</button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);

        tr.ondblclick = function() {
            openEditModal(row.id);
        };
    });

    // Agregar event listeners para los campos editables
    document.querySelectorAll('.editable').forEach(input => {
        input.addEventListener('change', function() {
            const id = this.dataset.id;
            const field = this.dataset.field;
            const value = this.value;
            
            // Encontrar la categoría y el índice del registro
            const [cat, index] = id.split('_');
            const recordIndex = parseInt(index);
            
            // Actualizar el dato en allData y filteredData
            if (allData[cat] && allData[cat][recordIndex]) {
                allData[cat][recordIndex][field] = value;
                filteredData[cat][recordIndex][field] = value;
            }
        });
    });

    if (recordCount) {
        recordCount.textContent = `${filteredData[category].length} registros`;
    }
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
                value.toString().toLowerCase().includes(searchTerm)
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

    // Crear workbook
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

    // Descargar archivo
    const fileName = `${category}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showStatus(`Archivo de ${category} guardado exitosamente como: ${fileName}`, 'success');
}

function addNewRecord(category) {
    if (allData[category].length === 0 && Object.values(allData).every(arr => arr.length === 0)) {
        showManualEntry();
        return;
    }

    const newIndex = allData[category].length;
    const newRecord = {
        id: `${category}_${newIndex}`,
        no: (Object.values(allData).reduce((sum, arr) => sum + arr.length, 0) + 1).toString(),
        tipo: '',
        factura: '',
        referencia: category === 'creditos' ? 'ESIN' : category === 'servicios' ? 'RNN' : category === 'stock' ? 'STOCK' : '',
        fechaFactura: '',
        fechaVencimiento: '',
        moneda: 'MXN',
        importe: '0',
        pago: '0',
        balance: '0',
        color: 'none',
        quien: '',
        pendiente: '0'
    };

    allData[category].push(newRecord);
    filteredData[category] = [...allData[category]];
    renderTable(category);
    showStatus(`Nuevo registro agregado a ${category}`, 'success');
}

function openEditModal(recordId) {
    currentEditingId = recordId;
    const [category, index] = recordId.split('_');
    const record = allData[category][parseInt(index)];
    
    if (!record) return;

    // Establecer valores en el modal
    document.getElementById('editPago').value = record.pago || '0';
    document.getElementById('editQuien').value = record.quien || '';
    document.getElementById('editPendiente').value = record.pendiente || record.balance || '0';

    // Establecer color seleccionado
    document.querySelectorAll('.color-option').forEach(option => {
        option.classList.remove('selected');
    });
    const selectedColor = document.querySelector(`[data-color="${record.color || 'none'}"]`);
    if (selectedColor) {
        selectedColor.classList.add('selected');
    }

    // Agregar event listeners para selección de color
    document.querySelectorAll('.color-option').forEach(option => {
        option.onclick = function() {
            document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
        };
    });

    document.getElementById('editModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('editModal').style.display = 'none';
    currentEditingId = null;
}

function saveEdit() {
    if (!currentEditingId) return;

    const [category, index] = currentEditingId.split('_');
    const record = allData[category][parseInt(index)];
    if (!record) return;

    // Obtener valores del modal
    const selectedColor = document.querySelector('.color-option.selected');
    const pago = document.getElementById('editPago').value;
    const quien = document.getElementById('editQuien').value;
    const pendiente = document.getElementById('editPendiente').value;

    // Actualizar el registro
    record.color = selectedColor ? selectedColor.dataset.color : 'none';
    record.pago = pago;
    record.quien = quien;
    record.pendiente = pendiente;

    // Actualizar también el balance si es necesario
    if (pago && !isNaN(parseFloat(pago.replace(/,/g, '')))) {
        const importeNum = parseFloat(record.importe.replace(/,/g, '')) || 0;
        const pagoNum = parseFloat(pago.replace(/,/g, '')) || 0;
        const newBalance = importeNum + pagoNum;
        record.balance = newBalance.toLocaleString();
    }

    // Actualizar también en filteredData
    filteredData[category][parseInt(index)] = {...record};

    // Actualizar la tabla
    renderTable(category);
    closeModal();
}

function showStatus(message, type) {
    status.innerHTML = message + (type === 'loading' ? '<span class="loading"></span>' : '');
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    if (type !== 'loading') {
        setTimeout(() => {
            status.style.display = 'none';
        }, 5000);
    }
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

// Hacer funciones globales para el HTML
window.openEditModal = openEditModal;
window.closeModal = closeModal;
window.saveEdit = saveEdit;
window.showManualEntry = showManualEntry;