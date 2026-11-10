# Piloto de Bria

El proyecto de OpenAI que emite la clave de Intelligence debe tener un límite
mensual estricto de hasta US$20. Verificar el proyecto, el límite aplicado y la
procedencia de la clave antes de activar el piloto.

Activar con BRIA_SPEND_PILOT=true y BRIA_SPEND_PILOT_USER_ID igual al ID de la
cuenta autorizada. La misma cuenta puede escribir en el chat web y desde su
vínculo de WhatsApp. El piloto usa GPT-6 Luna con razonamiento low. El dictado
y las notas de voz quedan fuera del piloto.

El transporte bloquea las llamadas de OpenAI que no provienen del chat
autorizado. La prueba generativa de arranque se omite. Gobierno de IA sigue
validando las solicitudes. OpenAI aplica el límite y Bria no reintenta los
errores de cuota o gasto del proveedor.
