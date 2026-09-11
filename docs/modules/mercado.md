# Módulo Mercado

Análisis de viabilidad y oportunidad de mercado.

## Descripción

Valida si el producto tiene demanda, identifica competencia, calcula TAM (Total Addressable Market).

## Input

json
{
 "productoId": "uuid",
 "nombre": "Mi Producto",
 "descripcion": "Descripción del producto...",
 "segmento": "SaaS B2B",
 "pais": "Argentina"
}

## Output

json
{
 "viabilidad_score": 85,
 "tam": 50000000,
 "competidores": [
   {
     "nombre": "Competidor 1",
     "fortalezas": [...],
     "debilidades": [...]
   }
 ],
 "oportunidades": [...],
 "recomendaciones": [...]
}

## Endpoint
