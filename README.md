# Partidos UCH — automated GitHub Pages

The Streamlit application and SQLite database remain local. This public repository contains only the read-only sanitized static snapshot inside `site/`.

Run the replacement `PUBLISH_PARTIDOS.bat` in the local Partidos project. It regenerates `public_site`, synchronizes it into `site/`, commits and pushes. GitHub Actions validates and deploys it.
