#!/bin/sh
# entrypoint.sh

# Default company code if env var is not set
COMPANY_CODE=${COMPANY_CODE:-default}
# --- REMOVED: API_BASE_URL logic no longer needed ---
# API_BASE_URL=${API_BASE_URL:-}
# --- End REMOVED ---
HTML_DIR=/usr/share/nginx/html
CONFIG_FILE=${HTML_DIR}/config.js
INDEX_FILE=${HTML_DIR}/index.html

# Create the config file (optional, only if COMPANY_CODE is needed in JS)
# --- REVERTED: Only include COMPANY_CODE --- 
echo "window.config = {" > ${CONFIG_FILE}
echo "  COMPANY_CODE: \"${COMPANY_CODE}\"," >> ${CONFIG_FILE}
# echo "  apiBaseUrl: \"${API_BASE_URL}\"," >> ${CONFIG_FILE} # REMOVED
echo "};" >> ${CONFIG_FILE}

echo "Generated ${CONFIG_FILE} with COMPANY_CODE: ${COMPANY_CODE}" # REMOVED API_BASE_URL from log

# Inject config script into index.html before the closing body tag
# Check if the script tag already exists to prevent duplicates on restart
if ! grep -q '<script src="/config.js"></script>' "${INDEX_FILE}"; then
  # Use sed to insert the script tag before the </body> tag
  sed -i '/<\/body>/i    <script src="/config.js"></script>' "${INDEX_FILE}"
  echo "Injected config.js script tag into ${INDEX_FILE} using sed"
fi

# Execute the original CMD (start nginx)
exec nginx -g 'daemon off;' 