using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;

namespace Codyx.EndUserInstaller;

public sealed class AppEntry : Application
{
  [STAThread]
  public static void Main()
  {
    var app = new AppEntry();
    app.Run(new InstallerWindow());
  }
}

public sealed class InstallerWindow : Window
{
  readonly TextBox log = new()
  {
    IsReadOnly = true,
    AcceptsReturn = true,
    TextWrapping = TextWrapping.Wrap,
    VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
    Background = new SolidColorBrush(Color.FromRgb(8, 13, 22)),
    Foreground = new SolidColorBrush(Color.FromRgb(226, 232, 240)),
    BorderBrush = new SolidColorBrush(Color.FromRgb(51, 65, 85)),
    MinHeight = 220,
  };

  readonly Button primary = new() { Content = "Agree and install", Padding = new Thickness(18, 10, 18, 10) };
  readonly Button cli = new() { Content = "Open CLI", Padding = new Thickness(16, 9, 16, 9), IsEnabled = false };
  readonly Button web = new() { Content = "Open Web UI", Padding = new Thickness(16, 9, 16, 9), IsEnabled = false };
  readonly Button uninstall = new() { Content = "Uninstall", Padding = new Thickness(16, 9, 16, 9), IsEnabled = false };
  readonly TextBlock status = new() { Foreground = Brushes.White, FontSize = 14 };

  string scriptPath = "";

  public InstallerWindow()
  {
    Title = "Codyx-Orchestrator Installer";
    Width = 980;
    Height = 760;
    MinWidth = 760;
    MinHeight = 620;
    Background = new SolidColorBrush(Color.FromRgb(5, 10, 18));
    WindowStartupLocation = WindowStartupLocation.CenterScreen;

    var root = new DockPanel { Margin = new Thickness(28) };
    Content = root;

    var header = new StackPanel { Margin = new Thickness(0, 0, 0, 18) };
    DockPanel.SetDock(header, Dock.Top);
    root.Children.Add(header);

    header.Children.Add(new TextBlock
    {
      Text = "Codyx-Orchestrator",
      Foreground = Brushes.White,
      FontSize = 34,
      FontWeight = FontWeights.Bold,
    });
    header.Children.Add(new TextBlock
    {
      Text = "Compiled end-user installer by M.Farid (Mufasa)",
      Foreground = new SolidColorBrush(Color.FromRgb(134, 239, 172)),
      FontSize = 16,
      Margin = new Thickness(0, 4, 0, 0),
    });

    var license = new TextBlock
    {
      Foreground = new SolidColorBrush(Color.FromRgb(203, 213, 225)),
      TextWrapping = TextWrapping.Wrap,
      Margin = new Thickness(0, 12, 0, 0),
    };
    license.Inlines.Add("This installer downloads compiled release assets with SHA256 verification. It does not clone the repository, install Git, or install Bun. By continuing, you agree to the ");
    license.Inlines.Add(Link("license terms", "https://install.kingkung.men/license"));
    license.Inlines.Add(" and acknowledge the ");
    license.Inlines.Add(Link("privacy notice", "https://install.kingkung.men/privacy"));
    license.Inlines.Add(".");
    header.Children.Add(license);

    var buttons = new StackPanel
    {
      Orientation = Orientation.Horizontal,
      HorizontalAlignment = HorizontalAlignment.Right,
      Margin = new Thickness(0, 0, 0, 14),
    };
    DockPanel.SetDock(buttons, Dock.Bottom);
    root.Children.Add(buttons);

    foreach (var button in new[] { uninstall, cli, web, primary })
    {
      button.Margin = new Thickness(8, 0, 0, 0);
      buttons.Children.Add(button);
    }

    var body = new DockPanel();
    root.Children.Add(body);

    DockPanel.SetDock(status, Dock.Top);
    status.Text = "Ready to install compiled release assets.";
    body.Children.Add(status);

    log.Margin = new Thickness(0, 12, 0, 0);
    body.Children.Add(log);

    primary.Click += async (_, _) => await InstallAsync();
    cli.Click += (_, _) => Launch("");
    web.Click += (_, _) => Launch("web");
    uninstall.Click += (_, _) => Launch("uninstall");
  }

  static Hyperlink Link(string text, string url)
  {
    var link = new Hyperlink(new Run(text)) { NavigateUri = new Uri(url) };
    link.RequestNavigate += (_, e) =>
    {
      Process.Start(new ProcessStartInfo(e.Uri.AbsoluteUri) { UseShellExecute = true });
      e.Handled = true;
    };
    return link;
  }

  async Task InstallAsync()
  {
    primary.IsEnabled = false;
    status.Text = "Installing compiled release assets...";
    log.Clear();
    scriptPath = ExtractScript();

    var args = $"-NoProfile -ExecutionPolicy Bypass -File \"{scriptPath}\" -AcceptLicense -NoLaunch";
    var code = await RunProcessAsync(PowerShellPath(), args);
    if (code == 0)
    {
      status.Text = "Codyx-Orchestrator is installed. Choose how to start.";
      primary.Content = "Reinstall / update";
      primary.IsEnabled = true;
      cli.IsEnabled = true;
      web.IsEnabled = true;
      uninstall.IsEnabled = true;
    }
    else
    {
      status.Text = $"Install failed with exit code {code}.";
      primary.Content = "Retry install";
      primary.IsEnabled = true;
    }
  }

  void Launch(string command)
  {
    var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    var shim = Path.Combine(local, "Programs", "Codyx-Orchestrator", "bin", "codyx.cmd");
    if (!File.Exists(shim))
    {
      Append($"Cannot find installed command: {shim}");
      return;
    }

    var args = string.IsNullOrWhiteSpace(command) ? $"/k \"{shim}\"" : $"/k \"{shim}\" {command}";
    Process.Start(new ProcessStartInfo("cmd.exe", args)
    {
      WorkingDirectory = Path.GetDirectoryName(shim) ?? local,
      UseShellExecute = true,
    });
  }

  async Task<int> RunProcessAsync(string fileName, string arguments)
  {
    var process = new Process
    {
      StartInfo = new ProcessStartInfo(fileName, arguments)
      {
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        CreateNoWindow = true,
      },
      EnableRaisingEvents = true,
    };

    var done = new TaskCompletionSource<int>();
    process.OutputDataReceived += (_, e) => { if (e.Data != null) Dispatcher.Invoke(() => Append(e.Data)); };
    process.ErrorDataReceived += (_, e) => { if (e.Data != null) Dispatcher.Invoke(() => Append(e.Data)); };
    process.Exited += (_, _) => done.TrySetResult(process.ExitCode);
    process.Start();
    process.BeginOutputReadLine();
    process.BeginErrorReadLine();
    return await done.Task;
  }

  void Append(string text)
  {
    log.AppendText(text + Environment.NewLine);
    log.ScrollToEnd();
  }

  static string PowerShellPath()
  {
    var systemRoot = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
    return Path.Combine(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  }

  static string ExtractScript()
  {
    var dir = Path.Combine(Path.GetTempPath(), "codyx-end-user-installer");
    Directory.CreateDirectory(dir);
    var target = Path.Combine(dir, "install-compiled.ps1");
    using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Codyx.EndUserInstaller.Resources.install-compiled.ps1")
      ?? throw new InvalidOperationException("Embedded install-compiled.ps1 was not found.");
    using var output = File.Create(target);
    stream.CopyTo(output);
    return target;
  }
}
