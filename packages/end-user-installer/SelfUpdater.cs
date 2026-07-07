using System;
using System.IO;
using System.Reflection;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using System.Net.Http;
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
            var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString();
            var isDebug = false;
#if DEBUG
            isDebug = true;
#endif
            var normPath = currentPath.ToLowerInvariant();
            if (version == "1.0.0.0" || isDebug || normPath.Contains(@"\codyx-orchestrator\packages"))
            {
                logCallback("[self-update] Bypassing self-update in development/debug environment.");
                return false;
            }

            logCallback($"[self-update] Checking self-update for asset ID: {assetId}...");

            using var http = new HttpClient();
            http.DefaultRequestHeaders.Add("User-Agent", "Codyx-Self-Updater");
            http.Timeout = TimeSpan.FromSeconds(10);

            // Fetch releases from GitHub
            var response = await http.GetAsync($"https://api.github.com/repos/{Repo}/releases?per_page=10");
            if (!response.IsSuccessStatusCode)
            {
                logCallback($"[self-update] Failed to check releases: {response.StatusCode}");
                return false;
            }

            using var releases = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            JsonElement? targetRelease = null;
            
            // Find latest non-draft, non-prerelease release
            foreach (var release in releases.RootElement.EnumerateArray())
            {
                var draft = release.TryGetProperty("draft", out var d) && d.GetBoolean();
                var prerelease = release.TryGetProperty("prerelease", out var pr) && pr.GetBoolean();
                if (draft || prerelease) continue;
                
                targetRelease = release;
                break;
            }

            if (targetRelease == null)
            {
                logCallback("[self-update] No valid release found on GitHub.");
                return false;
            }

            // Find release manifest asset
            string? manifestUrl = null;
            foreach (var asset in targetRelease.Value.GetProperty("assets").EnumerateArray())
            {
                if (asset.GetProperty("name").GetString() == "codyx-release-manifest.json")
                {
                    manifestUrl = asset.GetProperty("browser_download_url").GetString();
                    break;
                }
            }

            if (string.IsNullOrEmpty(manifestUrl))
            {
                logCallback("[self-update] No release manifest found in latest release.");
                return false;
            }

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
            var tempFile = Path.GetTempFileName();
            using (var fileStream = File.Create(tempFile))
            using (var downloadStream = await http.GetStreamAsync(fileUrl))
            {
                await downloadStream.CopyToAsync(fileStream);
            }

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

            logCallback("[self-update] Verification succeeded. Performing hot-swap and restarting...");

            var oldPath = currentPath + ".old";
            if (File.Exists(oldPath))
            {
                try { File.Delete(oldPath); } catch {}
            }

            File.Move(currentPath, oldPath);
            File.Copy(tempFile, currentPath, true);
            try { File.Delete(tempFile); } catch {}

            // Restart process
            Process.Start(new ProcessStartInfo
            {
                FileName = currentPath,
                UseShellExecute = true
            });

            Environment.Exit(0);
            return true;
        }
        catch (Exception ex)
        {
            logCallback($"[self-update] Update check failed: {ex.Message}");
            return false;
        }
    }
}
