@echo off
rem Lance le PostgreSQL local (binaires portables, dossier .pgdata)
set BASE=%~dp0
if not exist "%BASE%.pgsql\bin\pg_ctl.exe" (
  echo Binaires PostgreSQL absents : decompresser l'archive portable dans %BASE%.pgsql
  exit /b 1
)
"%BASE%.pgsql\bin\pg_ctl.exe" -D "%BASE%.pgdata" -l "%BASE%.pgdata\postgres.log" -o "-p 5432" start
