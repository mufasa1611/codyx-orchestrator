using System;
using System.IO;
using System.Reflection;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using System.Net.Http;
using System.Threading.Tasks;
using System.Xml;

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

            var token = Environment.GetEnvironmentVariable("GITHUB_TOKEN")
                ?? Environment.GetEnvironmentVariable("GH_TOKEN");
            if (!string.IsNullOrEmpty(token))
            {
                http.DefaultRequestHeaders.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            }

            string? latestTag = null;

            // PRIMARY: Use Atom feed (no rate limiting)
            try
            {
                var feedResponse = await http.GetAsync($"https://github.com/{Repo}/releases.atom");
                if (feedResponse.IsSuccessStatusCode)
                {
                    var xmlText = await feedResponse.Content.ReadAsStringAsync();
                    var xmlDoc = new XmlDocument();
                    xmlDoc.LoadXml(xmlText);
                    var entries = xmlDoc.SelectNodes("//*[local-name()='entry']");
                    if (entries != null)
                    {
                        foreach (XmlNode entry in entries)
                        {
                            var titleNode = entry.SelectSingleNode("*[local-name()='title']");
                            if (titleNode == null) continue;

                            var title = titleNode.InnerText.Trim();
                            if (!title.StartsWith("v") || title.Length < 2 || !char.IsDigit(title[1]))
                                continue;
                            if (title.Contains('-')) continue;

                            if (latestTag == null || CompareVersions(title, latestTag) > 0)
                            {
                                latestTag = title;
                            }
                        }
                    }
                }
            }
            catch {}

            // FALLBACK: REST API
            if (latestTag == null)
            {
                logCallback("[self-update] Atom feed failed, falling back to GitHub REST API...");
                var response = await http.GetAsync($"https://api.github.com/repos/{Repo}/releases?per_page=10");
                if (!response.IsSuccessStatusCode)
                {
                    logCallback($"[self-update] Failed to check releases: {response.StatusCode}");
                    return false;
                }

                using var releases = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                foreach (var release in releases.RootElement.EnumerateArray())
                {
                    var draft = release.TryGetProperty("draft", out var d) && d.GetBoolean();
                    var prerelease = release.TryGetProperty("prerelease", out var pr) && pr.GetBoolean();
                    if (draft || prerelease) continue;
                    latestTag = release.GetProperty("tag_name").GetString();
                    break;
                }
            }

            if (string.IsNullOrEmpty(latestTag))
            {
                logCallback("[self-update] No valid release found.");
                return false;
            }

            string manifestUrl = $"https://github.com/{Repo}/releases/download/{latestTag}/codyx-release-manifest.json";

            var manifestResponse = await http.GetAsync(manifestUrl);
            if (!manifestResponse.IsSuccessStatusCode)
            {
                logCallback($"[self-update] Failed to download release manifest: {manifestResponse.StatusCode}");
                return false;
            }

            using var manifest = JsonDocument.Parse(await manifestResponse.Content.ReadAsStringAsync());
            var asset = FindAsset(manifest.RootElement, assetId);
            if (asset == null)
            {
                logCallback($"[self-update] No asset found for ID: {assetId} in release {latestTag}.");
                return false;
            }

            var downloadUrl = asset.Value.GetProperty("url").GetString();
            var expectedSha256 = asset.Value.GetProperty("sha256").GetString();
            if (string.IsNullOrEmpty(downloadUrl) || string.IsNullOrEmpty(expectedSha256))
            {
                logCallback("[self-update] Asset URL or SHA256 missing.");
                return false;
            }

            logCallback($"[self-update] Downloading update v{latestTag.TrimStart('v')}...");
            statusCallback($"Downloading update v{latestTag.TrimStart('v')}...");

            var tempFile = Path.GetTempFileName();
            try
            {
                using var downloadStream = await http.GetStreamAsync(downloadUrl);
                using var fileStream = File.Create(tempFile);
                await downloadStream.CopyToAsync(fileStream);
                await fileStream.FlushAsync();
            }
            catch (Exception ex)
            {
                logCallback($"[self-update] Download failed: {ex.Message}");
                try { File.Delete(tempFile); } catch {}
                return false;
            }

            logCallback("[self-update] Verifying SHA256...");
            statusCallback("Verifying integrity...");

            string actualHash;
            using (var sha256 = SHA256.Create())
            using (var stream = File.OpenRead(tempFile))
            {
                var hashBytes = await sha256.ComputeHashAsync(stream);
                actualHash = BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
            }

            if (!string.Equals(actualHash, expectedSha256, StringComparison.OrdinalIgnoreCase))
            {
                logCallback("[self-update] SHA256 mismatch! Aborting update.");
                try { File.Delete(tempFile); } catch {}
                return false;
            }

            logCallback("[self-update] SHA256 verified. Applying update...");
            statusCallback("Applying update...");

            var oldPath = currentPath + ".old";
            try { if (File.Exists(oldPath)) File.Delete(oldPath); } catch {}

            File.Move(currentPath, oldPath);
            File.Move(tempFile, currentPath);

            logCallback($"[self-update] Update complete! Launcher will restart from v{latestTag.TrimStart('v')}.");
            statusCallback("Restarting...");

            Process.Start(new ProcessStartInfo(currentPath)
            {
                UseShellExecute = true,
                WorkingDirectory = Path.GetDirectoryName(currentPath),
            });

            Environment.Exit(0);
            return true;
        }
        catch (Exception ex)
        {
            logCallback($"[self-update] Error: {ex.Message}");
            return false;
        }
    }

    static JsonElement? FindAsset(JsonElement manifest, string assetId)
    {
        if (!manifest.TryGetProperty("assets", out var assets)) return null;
        foreach (var asset in assets.EnumerateArray())
        {
            if (asset.TryGetProperty("id", out var id) && id.GetString() == assetId)
                return asset;
        }
        return null;
    }

    static int CompareVersions(string left, string right)
    {
        var a = ParseVersion(left);
        var b = ParseVersion(right);
        for (var i = 0; i < 3; i++)
        {
            var diff = a[i].CompareTo(b[i]);
            if (diff != 0) return diff;
        }
        return 0;
    }

    static int[] ParseVersion(string version)
    {
        var normalized = version.Trim().TrimStart('v', 'V');
        var parts = normalized.Split('-')[0].Split('.');
        var parsed = new[] { 0, 0, 0 };
        for (var i = 0; i < Math.Min(3, parts.Length); i++)
        {
            int.TryParse(parts[i], out parsed[i]);
        }
        return parsed;
    }
}
