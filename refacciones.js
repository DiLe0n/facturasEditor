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
let groupingOptions = {
    creditos: 'none',
    servicios: 'none',
    stock: 'none',
    otros: 'none'
};

let sortingOptions = {
    creditos: 'date-desc',
    servicios: 'date-desc',
    stock: 'date-desc',
    otros: 'date-desc'
};
let currentEditingId = null;
let currentCategory = 'creditos';
let currentAddCategory = 'creditos';

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

// Event listeners para controles de agrupamiento
['creditos', 'servicios', 'stock', 'otros'].forEach(category => {
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
['creditos', 'servicios', 'stock', 'otros'].forEach(category => {
    const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
    const searchInput = document.getElementById(`searchInput${capitalizedCategory}`);
    const saveButton = document.getElementById(`saveButton${capitalizedCategory}`);
    const addButton = document.getElementById(`addButton${capitalizedCategory}`);
    
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
    if (!referencia) return 'otros';
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
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { 
                    type: 'array',
                    cellText: false,
                    cellDates: false,
                    raw: true,
                    dateNF: 'DD/MM/YYYY'
                });                
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { 
                    header: 1,
                    raw: false,
                    dateNF: 'DD/MM/YYYY'
                });
                
                const success = await processNewRecords(jsonData);
                if (!success) {
                    processButton.disabled = false;
                    return;
                }
            } catch (err) {
                showStatus('Error procesando el archivo: ' + err.message, 'error');
                processButton.disabled = false;
            }
        };
        reader.onerror = function() {
            showStatus('Error leyendo el archivo', 'error');
            processButton.disabled = false;
        };
        reader.readAsArrayBuffer(file);
    } catch (error) {
        showStatus('Error procesando el archivo: ' + error.message, 'error');
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
        pendiente: (row[9] || '0').toString()
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

        showStatus(`✅ ${newRecords.length} registros nuevos agregados exitosamente: Créditos(+${newCounts.creditos}), Servicios(+${newCounts.servicios}), Stock(+${newCounts.stock}), Otros(+${newCounts.otros})`, 'success');
        updateTabCounts();
        renderTable(currentCategory);

    } else {
        // CASO: Primera vez, no hay datos existentes - PROCESAR NORMALMENTE

        // Limpiar datos existentes
        allData = {
            creditos: [],
            servicios: [],
            stock: [],
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
        showStatus(`📊 Archivo procesado exitosamente. ${totalRecords} registros categorizados: Créditos(${allData.creditos.length}), Servicios(${allData.servicios.length}), Stock(${allData.stock.length}), Otros(${allData.otros.length})`, 'success');
        updateTabCounts();
        renderTable(currentCategory);
    }

    dataSection.style.display = 'block';
    switchTab('creditos');
    return true;
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
            }
        ],
        servicios: [
            {
                id: 'servicios_0',
                no: '2',
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
                no: '3',
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
                no: '4',
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

// Función para resetear agrupaciones y ordenamientos al cargar página
function resetOptionsToDefault() {
    // Resetear agrupaciones
    groupingOptions = {
        creditos: 'none',
        servicios: 'none',
        stock: 'none',
        otros: 'none'
    };
    
    // Resetear ordenamientos a fecha descendente (primera opción)
    sortingOptions = {
        creditos: 'date-desc',
        servicios: 'date-desc',
        stock: 'date-desc',
        otros: 'date-desc'
    };
    
    // Actualizar los selectores en la interfaz
    ['creditos', 'servicios', 'stock', 'otros'].forEach(category => {
        const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
        
        // Actualizar selector de agrupación
        const groupSelect = document.getElementById(`groupBy${capitalizedCategory}`);
        if (groupSelect) {
            groupSelect.value = 'none';
        }
        
        // Actualizar selector de ordenamiento
        const sortSelect = document.getElementById(`sortBy${capitalizedCategory}`);
        if (sortSelect) {
            sortSelect.value = 'date-desc';
        }
    });
}

function renderTable(category = currentCategory) {
    const tableBody = document.getElementById(`tableBody${category.charAt(0).toUpperCase() + category.slice(1)}`);
    const recordCount = document.getElementById(`recordCount${category.charAt(0).toUpperCase() + category.slice(1)}`);
    
    if (!tableBody) return;

    tableBody.innerHTML = '';
    
    const sortedRecords = sortRecords(filteredData[category], sortingOptions[category]);
    const groupedRecords = groupRecordsByPeriod(sortedRecords, groupingOptions[category]);
    
    groupedRecords.forEach(group => {
        if (groupingOptions[category] !== 'none') {
            const headerRow = document.createElement('tr');
            headerRow.innerHTML = `
                <td colspan="11" class="week-header">
                    <span>${group.label}</span>
                    <span class="week-summary">${group.summary}</span>
                </td>
            `;
            tableBody.appendChild(headerRow);
        }
        
        group.records.forEach((row) => {
            const tr = document.createElement('tr');

            let colorClass = '';
            if (row.color && row.color !== 'none') {
                colorClass = `row-${row.color}`;
            }

            if (row.credited) {
                colorClass += ' row-credited';
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
    });

    document.querySelectorAll('.editable').forEach(input => {
        input.addEventListener('change', function() {
            const id = this.dataset.id;
            const field = this.dataset.field;
            const value = this.value;
            
            const [cat, index] = id.split('_');
            const recordIndex = parseInt(index);
            
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
        case 'creditos':
            placeholderRef = 'ESIN1003196';
            break;
        case 'servicios':
            placeholderRef = 'RNN0997105';
            break;
        case 'stock':
            placeholderRef = 'STOCK001234';
            break;
        case 'otros':
            placeholderRef = 'OTROS123456';
            break;
    }
    referenciaInput.placeholder = placeholderRef;

    // Obtener fecha actual en formato DD/MM/YYYY
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Los meses van de 0-11
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

    document.getElementById('editPago').value = record.pago || '0';
    document.getElementById('editQuien').value = record.quien || '';
    document.getElementById('editPendiente').value = record.pendiente || record.balance || '0';

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

    // Actualizar el campo pendiente automáticamente
    const pendienteInput = document.getElementById('editPendiente');
    if (pendienteInput) {
        pendienteInput.value = Math.max(0, remaining).toLocaleString();
    }

    // Actualizar el campo pago total
    const pagoInput = document.getElementById('editPago');
    if (pagoInput && totalPaid > 0) {
        // No sobrescribir si el usuario está escribiendo un nuevo pago
        if (!pagoInput.value || pagoInput.value === '0') {
            // Solo mostrar el total si no hay un nuevo pago siendo ingresado
        }
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
    const pago = document.getElementById('editPago').value;
    const quien = document.getElementById('editQuien').value;
    const pendiente = document.getElementById('editPendiente').value;

    // Validar y procesar nuevo pago
    if (pago && parseFloat(pago.replace(/,/g, '')) > 0 && quien) {
        if (!record.paymentHistory) {
            record.paymentHistory = [];
        }
        
        const newPaymentAmount = parseFloat(pago.replace(/,/g, ''));
        const originalAmount = Math.abs(parseFloat(record.importe.replace(/,/g, '')) || 0);
        
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
        
        // Agregar el nuevo pago (permitir mismo nombre)
        record.paymentHistory.push({
            amount: newPaymentAmount.toLocaleString(),
            person: quien,
            date: new Date().toLocaleDateString('es-ES')
        });

        // Limpiar campos después de agregar pago
        document.getElementById('editPago').value = '';
        document.getElementById('editQuien').value = '';
        
        // Recalcular totales
        const newTotalPaid = totalPaid + newPaymentAmount;
        const remaining = originalAmount - newTotalPaid;
        
        // Actualizar campos calculados
        record.pago = newTotalPaid.toLocaleString();
        record.pendiente = remaining.toLocaleString();
        
        // FIXED: Consistent balance calculation
        const importeNum = parseFloat(record.importe.replace(/,/g, '')) || 0;
        record.balance = (importeNum + newTotalPaid).toLocaleString();
        
    } else {
        // Solo actualizar otros campos sin procesar pago
        if (pago) record.pago = pago;
        if (pendiente) record.pendiente = pendiente;
    }

    // Actualizar color
    record.color = selectedColor ? selectedColor.dataset.color : 'none';
    record.quien = quien;

    // Sincronizar datos
    filteredData[category][parseInt(index)] = {...record};
    
    loadPaymentHistory(record);
    renderTable(category);
    updateTabCounts();
    closeModal();

    showStatus('✅ Registro actualizado exitosamente', 'success');
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
    status.innerHTML = message + (type === 'loading' ? '<span class="loading"></span>' : '');
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
    document.getElementById('creditosCount').textContent = allData.creditos.length;
    document.getElementById('serviciosCount').textContent = allData.servicios.length;
    document.getElementById('stockCount').textContent = allData.stock.length;
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
            creditos: [],
            servicios: [],
            stock: [],
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
    
    ['creditos', 'servicios', 'stock', 'otros'].forEach(category => {
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
    
    const newAmount = document.getElementById('editPaymentAmount').value;
    const newPerson = document.getElementById('editPaymentPerson').value;
    const newDate = document.getElementById('editPaymentDate').value;
    
    record.paymentHistory[paymentIndex] = {
        amount: parseFloat(newAmount.replace(/,/g, '')).toLocaleString(),
        person: newPerson.trim(),
        date: convertInputToDate(newDate)
    };
    
    filteredData[category][parseInt(index)] = {...record};
    loadPaymentHistory(record);
    showStatus('✅ Pago actualizado exitosamente', 'success');
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
function validatePaymentAmount() {
    if (!currentEditingId) return true;
    
    const [category, index] = currentEditingId.split('_');
    const record = allData[category][parseInt(index)];
    if (!record) return true;
    
    const pagoInput = document.getElementById('editPago');
    const newPaymentAmount = parseFloat(pagoInput.value.replace(/,/g, '')) || 0;
    
    if (newPaymentAmount <= 0) return true; // No validar si no hay monto
    
    const originalAmount = Math.abs(parseFloat(record.importe.replace(/,/g, '')) || 0);
    const totalPaid = (record.paymentHistory || []).reduce((sum, payment) => {
        return sum + (parseFloat(payment.amount.replace(/,/g, '')) || 0);
    }, 0);
    
    const maxAllowed = originalAmount - totalPaid;
    
    if (newPaymentAmount > maxAllowed) {
        pagoInput.style.borderColor = '#e74c3c';
        pagoInput.title = `Máximo permitido: $${maxAllowed.toLocaleString()}`;
        return false;
    } else {
        pagoInput.style.borderColor = '';
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
    
    pagoInput.value = remaining.toLocaleString();
    
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
    
    pagoInput.value = paymentAmount.toLocaleString();
    
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
    
    const remaining = originalAmount - totalPaid;
    const isFullyPaid = remaining <= 0;

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
            
            ${!isFullyPaid ? `
                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ffc107;">
                    <strong>⚠️ Atención:</strong> Este registro aún tiene $${remaining.toLocaleString()} pendientes de pago.
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
            record.pago = originalAmount.toLocaleString();
            record.balance = (parseFloat(record.importe.replace(/,/g, '')) + originalAmount).toLocaleString();
            record.pendiente = "0";
        }
    }
    
    filteredData[category][parseInt(index)] = {...record};
    
    updateCreditStatus(record);
    loadPaymentHistory(record);
    renderTable(category);
    
    showStatus(`✅ Registro acreditado exitosamente por motivo: ${getCreditReasonText(reason)}`, 'success');
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

    if (record.credited) {
        // Estado: Acreditado
        statusIndicator.className = 'status-indicator credited';
        statusText.textContent = `Acreditado (${record.creditDate})`;
        statusIndicator.querySelector('.status-icon').textContent = '✅';
        
        creditButton.textContent = '🔄 Desacreditar';
        creditButton.className = 'credit-btn credited';
        creditButton.title = 'Revertir acreditación';
        
    } else {
        // Calcular estado basado en pagos
        const originalAmount = Math.abs(parseFloat(record.importe.replace(/,/g, '')) || 0);
        const totalPaid = (record.paymentHistory || []).reduce((sum, payment) => {
            return sum + (parseFloat(payment.amount.replace(/,/g, '')) || 0);
        }, 0);
        
        const remaining = originalAmount - totalPaid;
        const paymentPercentage = originalAmount > 0 ? (totalPaid / originalAmount) : 0;
        
        if (remaining <= 0) {
            // Completamente pagado
            statusIndicator.className = 'status-indicator paid';
            statusText.textContent = 'Pagado completamente';
            statusIndicator.querySelector('.status-icon').textContent = '💚';
        } else if (totalPaid > 0) {
            // Pagado parcialmente
            statusIndicator.className = 'status-indicator partial';
            statusText.textContent = `Pagado ${(paymentPercentage * 100).toFixed(1)}%`;
            statusIndicator.querySelector('.status-icon').textContent = '🔵';
        } else {
            // Pendiente
            statusIndicator.className = 'status-indicator pending';
            statusText.textContent = 'Pendiente de pago';
            statusIndicator.querySelector('.status-icon').textContent = '⏳';
        }
        
        creditButton.textContent = '✅ Acreditar';
        creditButton.className = 'credit-btn';
        creditButton.title = 'Marcar como acreditado';
    }
}

// FIXED: Consolidate DOMContentLoaded events
document.addEventListener('DOMContentLoaded', function() {
    resetOptionsToDefault();
    
    // Check required elements
    const requiredElements = [
        'fileInput', 'passwordInput', 'processButton', 'dataSection', 'status', 'fileName',
        'editModal', 'editPago', 'editQuien', 'editPendiente'
    ];
    
    const missingElements = requiredElements.filter(id => !document.getElementById(id));
    if (missingElements.length > 0) {
        console.error('Missing required elements:', missingElements);
    }

    // Add modal event listeners
    const addModal = document.getElementById('addModal');
    const editModal = document.getElementById('editModal');
    
    if (addModal) {
        addModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeAddModal();
            }
        });
    }
    
    if (editModal) {
        editModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });
    }
    
    // Keyboard event listeners
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (addModal && addModal.style.display === 'block') {
                closeAddModal();
            }
            if (editModal && editModal.style.display === 'block') {
                closeModal();
            }
        }
    });
    
    // Enter key listeners for add form
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
    
    // Auto-complete fields
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

    // Payment validation
    const pagoInput = document.getElementById('editPago');
    if (pagoInput) {
        pagoInput.addEventListener('input', validatePaymentAmount);
        pagoInput.addEventListener('blur', validatePaymentAmount);
    }
    
    // Number formatting
    ['editPago', 'editPendiente'].forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('blur', function() {
                const value = parseFloat(this.value.replace(/,/g, '')) || 0;
                if (value > 0) {
                    this.value = value.toLocaleString();
                }
            });
        }
    });
});

// Hacer funciones globales
window.addNewRecord = addNewRecord;
window.closeAddModal = closeAddModal;
window.saveNewRecord = saveNewRecord;

// Hacer funciones globales
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

// Event listeners para el modal
document.getElementById('editModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeModal();
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('editModal').style.display === 'block') {
        closeModal();
    }
});