# Adds the Fitness editor to the site menu on every page and a card on the home page.
# Run it once from inside your pz-editor repo folder:
#   powershell -ExecutionPolicy Bypass -File add-fitness-links.ps1
$utf8 = New-Object System.Text.UTF8Encoding($false)
$card = '    <a class="card" href="fitness.html"><div class="head"><h3>Fitness</h3><span class="n">7 exercises</span></div><p>Workout exercises: XP multiplier, muscle stiffness, metabolics and required equipment.</p><code>FitnessExercises.lua</code></a>'
Get-ChildItem -Filter *.html | Where-Object { $_.Name -ne 'fitness.html' } | ForEach-Object {
  $t = [IO.File]::ReadAllText($_.FullName)
  if ($t.Contains('href="fitness.html"')) { "skipped $($_.Name) (already has Fitness)"; return }
  $n = $t.Replace('>Weapon parts</a></div></nav>', '>Weapon parts</a><a href="fitness.html">Fitness</a></div></nav>')
  if ($_.Name -eq 'index.html') {
    $n = $n.Replace('<code>weaponpart.txt</code></a>', "<code>weaponpart.txt</code></a>`n$card")
  }
  if ($n -ne $t) { [IO.File]::WriteAllText($_.FullName, $n, $utf8); "updated $($_.Name)" }
  else { "NOT changed $($_.Name) (menu not found)" }
}
