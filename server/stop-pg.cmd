@echo off
rem Arrête le PostgreSQL local du projet
set BASE=%~dp0
"%BASE%.pgsql\bin\pg_ctl.exe" -D "%BASE%.pgdata" stop -m fast
