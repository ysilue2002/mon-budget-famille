@echo off
rem Démarre l'API backend (tsx watch) de Mon Budget Famille sur le port 4000
set BASE=%~dp0
cd /d "%BASE%"
npm run dev
