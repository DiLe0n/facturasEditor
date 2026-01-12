#!/usr/bin/env python3
import sys
import json
import msoffcrypto
import io
import openpyxl
from datetime import datetime
import os

def format_date(value):
    """Formatea fechas al formato DD/MM/YYYY"""
    if isinstance(value, datetime):
        return value.strftime('%d/%m/%Y')
    return str(value) if value is not None else ''

def decrypt_and_read_excel(file_path, password):
    """Desencripta y lee un archivo Excel"""
    try:
        print(f"🐍 Python: Procesando archivo: {file_path}", file=sys.stderr)
        print(f"🔐 Python: Contraseña proporcionada: {'SÍ' if password else 'NO'}", file=sys.stderr)
        
        # Leer el archivo encriptado
        with open(file_path, 'rb') as file:
            office_file = msoffcrypto.OfficeFile(file)
            
            # Verificar si está encriptado
            if office_file.is_encrypted():
                print("🔒 Python: Archivo está encriptado", file=sys.stderr)
                
                if not password:
                    return {
                        'success': False,
                        'error': 'El archivo está protegido con contraseña pero no se proporcionó ninguna'
                    }
                
                # Cargar la contraseña
                try:
                    office_file.load_key(password=password)
                    print("✅ Python: Contraseña aceptada", file=sys.stderr)
                except Exception as e:
                    print(f"❌ Python: Contraseña incorrecta - {str(e)}", file=sys.stderr)
                    return {
                        'success': False,
                        'error': 'Contraseña incorrecta',
                        'needsPassword': True
                    }
            else:
                print("🔓 Python: Archivo NO está encriptado", file=sys.stderr)
            
            # Desencriptar a memoria
            decrypted = io.BytesIO()
            office_file.decrypt(decrypted)
            decrypted.seek(0)
            
            print("📖 Python: Leyendo contenido con openpyxl...", file=sys.stderr)
            
            # Leer con openpyxl
            workbook = openpyxl.load_workbook(decrypted, data_only=True)
            sheet = workbook.active
            
            # Convertir a lista de listas
            data = []
            row_count = 0
            for row in sheet.iter_rows(values_only=True):
                row_data = []
                for cell in row:
                    if isinstance(cell, datetime):
                        row_data.append(format_date(cell))
                    elif cell is None:
                        row_data.append('')
                    else:
                        row_data.append(str(cell))
                data.append(row_data)
                row_count += 1
            
            print(f"✅ Python: Procesado exitosamente - {row_count} filas", file=sys.stderr)
            
            return {
                'success': True,
                'data': data,
                'rows': len(data),
                'cols': len(data[0]) if data else 0,
                'method': 'Python (msoffcrypto-tool)'
            }
            
    except Exception as e:
        print(f"❌ Python: Error - {str(e)}", file=sys.stderr)
        return {
            'success': False,
            'error': str(e),
            'type': type(e).__name__
        }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False, 
            'error': 'No se proporcionó la ruta del archivo'
        }))
        sys.exit(1)
    
    file_path = sys.argv[1]
    password = sys.argv[2] if len(sys.argv) > 2 else ''
    
    # Verificar que el archivo existe
    if not os.path.exists(file_path):
        print(json.dumps({
            'success': False,
            'error': f'El archivo no existe: {file_path}'
        }))
        sys.exit(1)
    
    result = decrypt_and_read_excel(file_path, password)
    print(json.dumps(result))