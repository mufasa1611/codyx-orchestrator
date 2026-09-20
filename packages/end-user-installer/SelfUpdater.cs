using System;
using System.IO;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace Codyx.EndUserInstaller;

public static class SelfUpdater
{
    private const string Repo = "mufasa1611/codyx-orchestrator";

    public static void CleanupOldFiles()
    {
        try
        {
            var currentPath = Environment.ProcessPath;
            if (string.IsNullOrEmpty(currentPath)) return;
            var oldPath = currentPath + ".old";
            
            // Run delayed cleanup
            Task.Run(async () =>
            {
                await Task.Delay(1500);
                if (File.Exists(oldPath))
                {
                    try { File.Delete(oldPath); } catch {}
                }
            });
        }
        catch {}
    }

    public static async Task<bool> CheckAndPerformUpdateAsync(
        string assetId,
        string channel,
        Action<string> statusCallback,
        Action<string> logCallback)
    {
        try
        {
            var currentPath = Environment.ProcessPath;
            if (string.IsNullOrEmpty(currentPath))
            {
                currentPath = Process.GetCurrentProcess().MainModule?.FileName;
            }
            if (string.IsNullOrEmpty(currentPath) || !File.Exists(currentPath)) return false;

            // Dev environment checks
            var isDebug = false;
#if DEBUG
            isDebug = true;
#endif
            var normPath = currentPath.ToLowerInvariant();
            if (isDebug || normPath.Contains(@"\codyx-orchestrator\packages"))
            {
                logCallback("[self-update] Bypassing self-update in development/debug environment.");
                return false;
            }

            var normalizedChannel = NormalizeChannel(channel);
            var prerelease = normalizedChannel == "beta";
            logCallback($"[self-update] Checking {normalizedChannel} self-update for asset ID: {assetId}...");

            using var http = new HttpClient();
            http.DefaultRequestHeaders.Add("User-Agent", "Codyx-Self-Updater");
            http.Timeout = TimeSpan.FromMinutes(15);

            var latestTag = await GetNewestReleaseTagAsync(http, prerelease, logCallback);
            if (latestTag == null && prerelease)
            {
                logCallback("[self-update] No beta/pre-release launcher found. Falling back to stable.");
                latestTag = await GetNewestReleaseTagAsync(http, false, logCallback);
            }

            if (string.IsNullOrEmpty(latestTag))
            {
                logCallback("[self-update] No valid release found on GitHub.");
                return false;
            }

            // Construct release manifest URL directly from the tag name
            string manifestUrl = $"https://github.com/{Repo}/releases/download/{latestTag}/codyx-release-manifest.json";

            // Download manifest
            var manifestResponse = await http.GetAsync(manifestUrl);
            if (!manifestResponse.IsSuccessStatusCode)
            {
                logCallback("[self-update] Failed to download release manifest.");
                return false;
            }

            using var manifest = JsonDocument.Parse(await manifestResponse.Content.ReadAsStringAsync());
            var root = manifest.RootElement;
            
            // Look for matching asset
            string? fileUrl = null;
            string? expectedSha256 = null;
            
            if (root.TryGetProperty("assets", out var assetsProp))
            {
                foreach (var asset in assetsProp.EnumerateArray())
                {
                    if (asset.GetProperty("id").GetString() == assetId)
                    {
                        fileUrl = asset.GetProperty("url").GetString();
                        expectedSha256 = asset.GetProperty("sha256").GetString();
                        break;
                    }
                }
            }

            if (string.IsNullOrEmpty(fileUrl) || string.IsNullOrEmpty(expectedSha256))
            {
                logCallback($"[self-update] Asset {assetId} not found in release manifest.");
                return false;
            }

            // Calculate current file hash
            string currentSha256;
            using (var sha = SHA256.Create())
            using (var stream = File.OpenRead(currentPath))
            {
                var hashBytes = await sha.ComputeHashAsync(stream);
                currentSha256 = BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
            }

            if (currentSha256 == expectedSha256.ToLowerInvariant())
            {
                logCallback("[self-update] Executable is already up-to-date.");
                return false;
            }

            logCallback($"[self-update] New version available! Downloading updated binary...");
            statusCallback("Self-updating installer...");

            // Download the new binary
            var tempFile = Path.Combine(Path.GetTempPath(), $"codyx-installer-{Guid.NewGuid():N}.exe");
            await DownloadFileAsync(http, fileUrl, tempFile, logCallback);

            // Verify hash of downloaded file
            string downloadedSha256;
            using (var sha = SHA256.Create())
            using (var stream = File.OpenRead(tempFile))
            {
                var hashBytes = await sha.ComputeHashAsync(stream);
                downloadedSha256 = BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
            }

            if (downloadedSha256 != expectedSha256.ToLowerInvariant())
            {
                logCallback("[self-update] SHA256 verification failed for downloaded binary.");
                try { File.Delete(tempFile); } catch {}
                return false;
            }

            logCallback("[self-update] Verification succeeded. Restarting through updater handoff...");
            StartHandoff(Process.GetCurrentProcess().Id, currentPath, tempFile, logCallback);

            Environment.Exit(0);
            return true;
        }
        catch (Exception ex)
        {
            logCallback($"[self-update] Update check failed: {ex.Message}");
            return false;
        }
    }

    private static string NormalizeChannel(string? channel)
    {
        var value = (channel ?? "").Trim().ToLowerInvariant();
        return value is "beta" or "prerelease" or "pre-release" or "preview" or "end-user-x" or "dev" ? "beta" : "stable";
    }

    private static async Task<string?> GetNewestReleaseTagAsync(HttpClient http, bool prerelease, Action<string> logCallback)
    {
        try
        {
            var response = await http.GetAsync($"https://api.github.com/repos/{Repo}/releases?per_page=20");
            if (response.IsSuccessStatusCode)
            {
                using var releases = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                foreach (var release in releases.RootElement.EnumerateArray())
                {
                    var draft = release.TryGetProperty("draft", out var d) && d.GetBoolean();
                    var isPrerelease = release.TryGetProperty("prerelease", out var pr) && pr.GetBoolean();
                    if (draft || isPrerelease != prerelease) continue;
                    return release.GetProperty("tag_name").GetString();
                }
            }
            else
            {
                logCallback($"[self-update] Failed to check releases: {response.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            logCallback($"[self-update] REST release check failed: {ex.Message}");
        }

        try
        {
            var feedResponse = await http.GetAsync($"https://github.com/{Repo}/releases.atom");
            if (!feedResponse.IsSuccessStatusCode) return null;

            var xmlText = await feedResponse.Content.ReadAsStringAsync();
            var xmlDoc = new System.Xml.XmlDocument();
            xmlDoc.LoadXml(xmlText);
            var entries = xmlDoc.SelectNodes("//*[local-name()='entry']");
            if (entries == null) return null;

            foreach (System.Xml.XmlNode entry in entries)
            {
                var title = entry.SelectSingleNode("*[local-name()='title']")?.InnerText.Trim();
                if (string.IsNullOrWhiteSpace(title) || !title.StartsWith("v", StringComparison.OrdinalIgnoreCase)) continue;
                var isPrerelease = title.Contains('-');
                if (isPrerelease == prerelease) return title;
            }
        }
        catch (Exception ex)
        {
            logCallback($"[self-update] Atom release check failed: {ex.Message}");
        }

        return null;
    }

    private static async Task DownloadFileAsync(HttpClient http, string url, string destination, Action<string> logCallback)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();

        var total = response.Content.Headers.ContentLength;
        await using var input = await response.Content.ReadAsStreamAsync();
        await using var output = File.Create(destination);

        var buffer = new byte[1024 * 1024];
        long downloaded = 0;
        long lastLoggedMB = -1;
        while (true)
        {
            var read = await input.ReadAsync(buffer.AsMemory(0, buffer.Length));
            if (read <= 0) break;
            await output.WriteAsync(buffer.AsMemory(0, read));
            downloaded += read;

            var downloadedMB = downloaded / 1024 / 1024;
            if (downloadedMB != lastLoggedMB && (downloadedMB < 10 || downloadedMB % 10 == 0))
            {
                lastLoggedMB = downloadedMB;
                if (total.HasValue)
                {
                    logCallback($"[self-update] Downloaded {downloadedMB} MB of {Math.Round(total.Value / 1024d / 1024d, 1)} MB...");
                }
                else
                {
                    logCallback($"[self-update] Downloaded {downloadedMB} MB...");
                }
            }
        }

        var item = new FileInfo(destination);
        if (!item.Exists || item.Length <= 0) throw new InvalidOperationException("Downloaded installer is empty.");
        if (total.HasValue && item.Length != total.Value)
        {
            throw new InvalidOperationException($"Downloaded {item.Length} bytes, expected {total.Value} bytes.");
        }
    }

    private static void StartHandoff(int processId, string currentPath, string tempFile, Action<string> logCallback)
    {
        var handoff = Path.Combine(Path.GetTempPath(), $"codyx-installer-handoff-{Guid.NewGuid():N}.ps1");
        var script = $$"""
$ErrorActionPreference = "Stop"
$pidToWait = {{processId}}
$current = {{PowerShellLiteral(currentPath)}}
$temp = {{PowerShellLiteral(tempFile)}}
$old = "$current.old"
try { Wait-Process -Id $pidToWait -Timeout 30 -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Milliseconds 400
if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Force -ErrorAction SilentlyContinue }
Move-Item -LiteralPath $current -Destination $old -Force
Copy-Item -LiteralPath $temp -Destination $current -Force
Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
Start-Process -FilePath $current
Start-Sleep -Seconds 2
Remove-Item -LiteralPath $old -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
""";
        File.WriteAllText(handoff, script, new UTF8Encoding(false));
        logCallback($"[self-update] Starting handoff updater: {handoff}");
        Process.Start(new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-NoProfile -ExecutionPolicy Bypass -File {PowerShellArgument(handoff)}",
            CreateNoWindow = true,
            UseShellExecute = false,
            WindowStyle = ProcessWindowStyle.Hidden
        });
    }

    private static string PowerShellLiteral(string value)
    {
        return "'" + value.Replace("'", "''") + "'";
    }

    private static string PowerShellArgument(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }
}
