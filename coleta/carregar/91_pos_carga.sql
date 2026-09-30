-- Ajustes pós-carga (rodado pelo 90_carregar_pg.py depois da carga; idempotente).
-- Máscara de CPF em números de documento: numero_documento é poupado da máscara genérica (é identificador),
-- mas em recibos de pessoa física o TSE e a ALBA às vezes publicam o CPF do fornecedor como número do documento.
CREATE OR REPLACE FUNCTION pg_temp.cpf_valido(d text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT length(d) = 11 AND d !~ '^(\d)\1{10}$'
     AND ((SELECT sum(substr(d, i, 1)::int * (11 - i)) FROM generate_series(1, 9) i) * 10 % 11 % 10) = substr(d, 10, 1)::int
     AND ((SELECT sum(substr(d, i, 1)::int * (12 - i)) FROM generate_series(1, 10) i) * 10 % 11 % 10) = substr(d, 11, 1)::int
$$;

UPDATE campanha_despesa SET numero_documento = '***CPF***'
 WHERE numero_documento IS NOT NULL
   AND ((fornecedor_pf AND regexp_replace(numero_documento, '\D', '', 'g') ~ '^\d{11}$')
        OR numero_documento ~ '(^|\D)\d{3}\.\d{3}\.\d{3}-\d{2}(\D|$)');

UPDATE cota_despesa SET numero_documento = '***CPF***'
 WHERE numero_documento IS NOT NULL
   AND ((fornecedor_pf AND regexp_replace(numero_documento, '\D', '', 'g') ~ '^\d{11}$')
        OR (numero_documento ~ '(^|\D)\d{3}\.\d{3}\.\d{3}-\d{2}(\D|$)'
            AND pg_temp.cpf_valido(regexp_replace(numero_documento, '\D', '', 'g'))));
