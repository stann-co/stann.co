@echo off
REM ============================================================
REM  Double-click to update the art bookmarks:
REM    1. bun run merge   (fold in "new bookmarks/*.json")
REM    2. git add .
REM    3. git commit -m "added bookmarks"
REM    4. git push
REM  Stops on the first error; keeps the window open at the end.
REM ============================================================

setlocal
cd /d "%~dp0"

echo ============================================================
echo   Updating art bookmarks
echo ============================================================

echo.
echo [1/4] Merging new bookmarks...
call bun run merge
if errorlevel 1 goto :error

echo.
echo [2/4] Staging changes...
git add .
if errorlevel 1 goto :error

echo.
echo [3/4] Committing...
REM  "git diff --cached --quiet" exits 1 when there ARE staged changes.
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "added bookmarks"
    if errorlevel 1 goto :error
) else (
    echo   Nothing to commit - skipping commit and push.
    goto :done
)

echo.
echo [4/4] Pushing to GitHub...
git push
if errorlevel 1 goto :error

:done
echo.
echo ============================================================
echo   Done!
echo ============================================================
pause
exit /b 0

:error
echo.
echo ***  Something went wrong above - nothing further was run.  ***
pause
exit /b 1
