#!/bin/sh
# src/ içindeki parçaları tek dosyalık sayfaya birleştirir
cd "$(dirname "$0")"
{
  cat src/shell.html
  printf '<script>\n'; cat src/analysis.js; printf '</script>\n'
  printf "<script>\n"; cat src/classify.js; printf "</script>\n"
  printf '<script>\n'; cat src/synth.js; printf '</script>\n'
  printf '<script>\n'; cat src/game.js; printf '</script>\n'
} > dokun-cal.html
{
  printf '<!doctype html>\n<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'
  cat dokun-cal.html
  printf '</body></html>\n'
} > index.html
echo "dokun-cal.html ve index.html hazır"
