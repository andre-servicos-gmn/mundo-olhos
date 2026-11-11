@echo off
rem Abre o Mundo Olhos: sobe um servidor local e abre o navegador.
cd /d "%~dp0"
start "" http://localhost:8080/
python -m http.server 8080
