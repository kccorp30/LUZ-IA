-- ═══════════════════════════════════════════════════════════
-- LUZ IA · RECUPERACIÓN MASIVA de fotos del Storage
-- 
-- ⚠️ IMPORTANTE: Solo corre este SQL DESPUÉS de haber visto
-- el resultado del diagnóstico (diagnostico_fotos.sql)
-- 
-- Este script:
-- 1. Lee TODOS los archivos en el bucket 'media' bajo 'menu-productos/'
-- 2. Por cada archivo, extrae el product_id del nombre
-- 3. Si el producto existe Y no tiene foto, le pone la URL pública
-- 4. Si hay múltiples fotos para un producto, usa la MÁS RECIENTE
-- 
-- Es 100% reversible: si algo sale mal, puedes correr el "rollback" al final
-- ═══════════════════════════════════════════════════════════

-- ══════════════ PASO 1: Backup automático ══════════════
-- Crea una tabla temporal con el estado actual antes de cambiar
CREATE TABLE IF NOT EXISTS _backup_imagen_url_pre_recuperacion AS
SELECT id, imagen_url, NOW() as backed_up_at
FROM menu_items
WHERE restaurante_id = '2cc8adc0-068b-4cc5-b880-5239346539ef';

-- ══════════════ PASO 2: Recuperación masiva ══════════════
WITH 
-- Por cada producto, obtener la foto MÁS RECIENTE en Storage
fotos_recientes AS (
  SELECT DISTINCT ON (product_id)
    SPLIT_PART(SPLIT_PART(name, '/', 3), '-', 1) as product_id,
    name as ruta_archivo,
    created_at
  FROM storage.objects
  WHERE bucket_id = 'media'
    AND name LIKE 'menu-productos/2cc8adc0-068b-4cc5-b880-5239346539ef/%'
    AND name NOT LIKE '%/.%'  -- ignorar archivos ocultos
  ORDER BY product_id, created_at DESC
),
-- Construir la URL pública para cada foto
urls_publicas AS (
  SELECT 
    product_id,
    'https://vbxuwzcfzfjwhllkppkg.supabase.co/storage/v1/object/public/media/' || ruta_archivo as url_publica
  FROM fotos_recientes
)
-- UPDATE: Solo a productos que NO tienen foto actualmente
UPDATE menu_items mi
SET imagen_url = up.url_publica,
    updated_at = NOW()
FROM urls_publicas up
WHERE up.product_id::uuid = mi.id
  AND mi.restaurante_id = '2cc8adc0-068b-4cc5-b880-5239346539ef'
  AND (mi.imagen_url IS NULL OR mi.imagen_url = '');

-- ══════════════ PASO 3: Verificación post-recuperación ══════════════
SELECT 
  COUNT(*) FILTER (WHERE imagen_url IS NULL OR imagen_url = '') as siguen_sin_foto,
  COUNT(*) FILTER (WHERE imagen_url IS NOT NULL AND imagen_url != '') as con_foto_ahora,
  COUNT(*) as total
FROM menu_items
WHERE restaurante_id = '2cc8adc0-068b-4cc5-b880-5239346539ef'
  AND disponible = true;

-- ══════════════ PASO 4: Ver muestra de productos recuperados ══════════════
SELECT nombre, categoria, precio, 
  CASE 
    WHEN imagen_url IS NOT NULL AND imagen_url != '' THEN '✅ Con foto'
    ELSE '⏳ Sin foto'
  END as estado,
  imagen_url
FROM menu_items
WHERE restaurante_id = '2cc8adc0-068b-4cc5-b880-5239346539ef'
  AND disponible = true
ORDER BY estado DESC, categoria, nombre
LIMIT 30;

-- ═══════════════════════════════════════════════════════════
-- ROLLBACK (si algo salió mal, descomenta y corre esto):
-- ═══════════════════════════════════════════════════════════
-- UPDATE menu_items mi
-- SET imagen_url = b.imagen_url
-- FROM _backup_imagen_url_pre_recuperacion b
-- WHERE b.id = mi.id
--   AND mi.restaurante_id = '2cc8adc0-068b-4cc5-b880-5239346539ef';

-- ═══════════════════════════════════════════════════════════
-- LIMPIEZA (cuando estés 100% seguro de que todo está bien):
-- ═══════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS _backup_imagen_url_pre_recuperacion;
