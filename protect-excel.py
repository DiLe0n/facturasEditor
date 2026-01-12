#!/usr/bin/env python3
import sys
import json
import msoffcrypto
import io
import os

def protect_excel(input_path, output_path, password):
    """Protege un archivo Excel con contraseña"""
    try:
        print(f"🔐 Python: Protegiendo archivo: {input_path}", file=sys.stderr)
        print(f"🔑 Python: Contraseña: {password}", file=sys.stderr)
        
        # Leer el archivo sin protección
        with open(input_path, 'rb') as input_file:
            excel_data = input_file.read()
        
        # Crear objeto msoffcrypto
        encrypted = io.BytesIO()
        
        # Encriptar con contraseña
        office_file = msoffcrypto.OfficeFile(io.BytesIO(excel_data))
        office_file.load_key(password=password)
        office_file.encrypt(password, encrypted)
        
        # Guardar archivo protegido
        with open(output_path, 'wb') as output_file:
            output_file.write(encrypted.getvalue())
        
        print(f"✅ Python: Archivo protegido guardado en: {output_path}", file=sys.stderr)
        
        return {
            'success': True,
            'message': 'Archivo protegido exitosamente',
            'output_path': output_path
        }
        
    except Exception as e:
        print(f"❌ Python: Error - {str(e)}", file=sys.stderr)
        return {
            'success': False,
            'error': str(e),
            'type': type(e).__name__
        }

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print(json.dumps({
            'success': False, 
            'error': 'Uso: python protect-excel.py <input_file> <output_file> <password>'
        }))
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    password = sys.argv[3]
    
    # Verificar que el archivo de entrada existe
    if not os.path.exists(input_path):
        print(json.dumps({
            'success': False,
            'error': f'El archivo no existe: {input_path}'
        }))
        sys.exit(1)
    
    result = protect_excel(input_path, output_path, password)
    print(json.dumps(result))