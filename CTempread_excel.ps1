$path = 'C:\Users\Usuario\Desktop\APP PARA FICHAR\material\Planilla personal 04-2026.xlsx'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open($path)
$ws = $wb.Sheets.Item(1)
$lastRow = $ws.UsedRange.Rows.Count
$lastCol = $ws.UsedRange.Columns.Count
$out = @("Rows:$lastRow Cols:$lastCol")
for ($r = 1; $r -le $lastRow; $r++) {
  $cells = @()
  for ($c = 1; $c -le $lastCol; $c++) {
    $cells += $ws.Cells.Item($r, $c).Text
  }
  $out += ($cells -join '|')
}
$wb.Close($false)
$excel.Quit()
$out | Out-File -FilePath 'C:\Temp\excel_out.txt' -Encoding UTF8
