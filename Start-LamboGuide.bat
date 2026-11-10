@echo off
cd /d "%~dp0"
where pythonw >nul 2>nul && (start "" pythonw "%~dp0lamboguide_companion.py" & exit /b 0)
where pyw >nul 2>nul && (start "" pyw -3 "%~dp0lamboguide_companion.py" & exit /b 0)
where python >nul 2>nul && (start "" python "%~dp0lamboguide_companion.py" & exit /b 0)
echo Python 3 bulunamadi. https://www.python.org/downloads/ adresinden kur ("Add to PATH" kutusunu isaretle).
pause
