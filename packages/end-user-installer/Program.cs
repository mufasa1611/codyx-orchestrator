using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using IOPath = System.IO.Path;

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
  readonly Border promptPanel = new()
  {
    Visibility = Visibility.Collapsed,
    Background = new SolidColorBrush(Color.FromRgb(11, 18, 30)),
    BorderBrush = new SolidColorBrush(Color.FromRgb(51, 65, 85)),
    BorderThickness = new Thickness(1),
    Padding = new Thickness(12),
    Margin = new Thickness(0, 12, 0, 0),
  };
  readonly TextBlock promptText = new()
  {
    Foreground = Brushes.White,
    FontWeight = FontWeights.SemiBold,
    TextWrapping = TextWrapping.Wrap,
    Margin = new Thickness(0, 0, 0, 8),
  };
  readonly TextBox promptAnswer = new()
  {
    IsEnabled = false,
    MinWidth = 300,
    Margin = new Thickness(0, 0, 8, 0),
  };
  readonly Button promptSend = new() { Content = "Send", Padding = new Thickness(14, 7, 14, 7), IsEnabled = false };
  readonly Button promptCancel = new() { Content = "Cancel", Padding = new Thickness(14, 7, 14, 7), IsEnabled = false };
  readonly Button promptChangeEmail = new() { Content = "Change email", Padding = new Thickness(14, 7, 14, 7), IsEnabled = false, Visibility = Visibility.Collapsed };
  readonly Button promptResend = new() { Content = "Resend", Padding = new Thickness(14, 7, 14, 7), IsEnabled = false, Visibility = Visibility.Collapsed };

  string scriptPath = "";
  Process? activeInstallerProcess;
  bool promptActive;
  bool promptIsCode;

  public InstallerWindow()
  {
    Title = "Codyx-Orchestrator Installer";
    Icon = new BitmapImage(new Uri("pack://application:,,,/Assets/mufasa.png"));
    Width = 980;
    Height = 900;
    MinWidth = 780;
    MinHeight = 720;
    Background = new SolidColorBrush(Color.FromRgb(9, 12, 18));
    WindowStartupLocation = WindowStartupLocation.CenterScreen;

    var shell = new DockPanel();
    Content = shell;
    var banner = BuildBanner();
    DockPanel.SetDock(banner, Dock.Top);
    shell.Children.Add(banner);

    var root = new DockPanel { Margin = new Thickness(32, 26, 32, 24) };
    shell.Children.Add(root);

    var header = new StackPanel { Margin = new Thickness(0, 0, 0, 18), HorizontalAlignment = HorizontalAlignment.Center };
    DockPanel.SetDock(header, Dock.Top);
    root.Children.Add(header);

    header.Children.Add(new Image
    {
      Source = new BitmapImage(new Uri("pack://application:,,,/Assets/mufasa.png")),
      Height = 170,
      Stretch = Stretch.Uniform,
      HorizontalAlignment = HorizontalAlignment.Center,
      Margin = new Thickness(0, 0, 0, 16),
    });

    header.Children.Add(new TextBlock
    {
      Text = "Welcome to Codyx",
      Foreground = BuildShimmerBrush(-1.5),
      FontSize = 32,
      FontWeight = FontWeights.Bold,
      HorizontalAlignment = HorizontalAlignment.Center,
    });
    header.Children.Add(new TextBlock
    {
      Text = "A multi-agent assistant",
      Foreground = new SolidColorBrush(Color.FromRgb(165, 176, 195)),
      FontSize = 16,
      FontWeight = FontWeights.SemiBold,
      HorizontalAlignment = HorizontalAlignment.Center,
      Margin = new Thickness(0, 4, 0, 0),
    });
    header.Children.Add(new TextBlock
    {
      Text = "by M. Farid (Mufasa)",
      Foreground = BuildShimmerBrush(1.5),
      FontSize = 18,
      FontWeight = FontWeights.SemiBold,
      FontFamily = new FontFamily("Segoe Script"),
      HorizontalAlignment = HorizontalAlignment.Center,
      Margin = new Thickness(0, 4, 0, 12),
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

    var promptRoot = new StackPanel();
    promptRoot.Children.Add(promptText);
    var promptRow = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
    promptRow.Children.Add(promptAnswer);
    promptChangeEmail.Margin = new Thickness(0, 0, 8, 0);
    promptResend.Margin = new Thickness(0, 0, 8, 0);
    promptCancel.Margin = new Thickness(0, 0, 8, 0);
    promptRow.Children.Add(promptChangeEmail);
    promptRow.Children.Add(promptResend);
    promptRow.Children.Add(promptCancel);
    promptRow.Children.Add(promptSend);
    promptPanel.Child = promptRoot;
    promptRoot.Children.Add(promptRow);
    DockPanel.SetDock(promptPanel, Dock.Top);
    body.Children.Add(promptPanel);

    log.Margin = new Thickness(0, 12, 0, 0);
    body.Children.Add(log);

    primary.Click += async (_, _) => await InstallAsync();
    cli.Click += (_, _) => Launch("");
    web.Click += (_, _) => Launch("web");
    uninstall.Click += (_, _) => Launch("uninstall");
    promptSend.Click += (_, _) => SendPromptAnswer(promptAnswer.Text);
    promptCancel.Click += (_, _) => SendPromptAnswer("cancel");
    promptChangeEmail.Click += (_, _) => SendPromptAnswer(IsEmailConfirmationPrompt(promptText.Text) ? "n" : "change-email");
    promptResend.Click += (_, _) => SendPromptAnswer("resend");
    promptAnswer.KeyDown += (_, e) =>
    {
      if (e.Key == Key.Enter)
      {
        SendPromptAnswer(promptAnswer.Text);
        e.Handled = true;
      }
    };
    RefreshInstalledActions();
  }

  static UIElement BuildBanner()
  {
    var grid = new Grid
    {
      Height = 128,
      ClipToBounds = true,
      Background = new LinearGradientBrush(Color.FromRgb(10, 18, 30), Color.FromRgb(20, 38, 34), 0),
    };

    var glow = new Rectangle
    {
      Fill = new LinearGradientBrush(
        [
          new GradientStop(Color.FromArgb(0, 28, 216, 117), 0),
          new GradientStop(Color.FromArgb(180, 28, 216, 117), 0.45),
          new GradientStop(Color.FromArgb(0, 88, 166, 255), 1),
        ],
        0),
      Opacity = 0.45,
      Width = 360,
      HorizontalAlignment = HorizontalAlignment.Left,
      RenderTransform = new TranslateTransform(-360, 0),
    };
    grid.Children.Add(glow);

    ((TranslateTransform)glow.RenderTransform).BeginAnimation(
      TranslateTransform.XProperty,
      new DoubleAnimation(-360, 980, TimeSpan.FromSeconds(4.2))
      {
        RepeatBehavior = RepeatBehavior.Forever,
        EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut },
      });

    grid.Children.Add(new TextBlock
    {
      Text = "Codyx-Orchestrator",
      Foreground = Brushes.White,
      FontSize = 36,
      FontWeight = FontWeights.Bold,
      HorizontalAlignment = HorizontalAlignment.Center,
      VerticalAlignment = VerticalAlignment.Center,
    });

    return grid;
  }

  static Brush BuildShimmerBrush(double from)
  {
    var brush = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 0) };
    brush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 255, 255), 0.0));
    brush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 255, 255), 0.25));
    brush.GradientStops.Add(new GradientStop(Color.FromRgb(46, 204, 113), 0.4));
    brush.GradientStops.Add(new GradientStop(Color.FromRgb(120, 225, 160), 0.48));
    brush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 250, 200), 0.5));
    brush.GradientStops.Add(new GradientStop(Color.FromRgb(120, 225, 160), 0.52));
    brush.GradientStops.Add(new GradientStop(Color.FromRgb(46, 204, 113), 0.6));
    brush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 255, 255), 0.75));
    brush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 255, 255), 1.0));
    var transform = new TranslateTransform(from, 0);
    brush.RelativeTransform = transform;
    transform.BeginAnimation(
      TranslateTransform.XProperty,
      new DoubleAnimation(from, -from, TimeSpan.FromSeconds(6.0))
      {
        RepeatBehavior = RepeatBehavior.Forever,
        EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut },
      });
    return brush;
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
    SetInstalledActions(false);
    status.Text = "Complete identity and email verification, then install compiled release assets.";
    log.Clear();
    scriptPath = ExtractScripts();

    var args = $"-NoProfile -ExecutionPolicy Bypass -File \"{scriptPath}\" -AcceptLicense -NoLaunch";
    var localManifest = LocalManifestPath();
    if (localManifest is not null)
    {
      args += $" -ManifestUrl \"{localManifest}\"";
      Append($"Using local release manifest: {localManifest}");
    }
    var code = await RunProcessAsync(PowerShellPath(), args);
    if (code == 0)
    {
      status.Text = "Codyx-Orchestrator is installed. Choose how to start.";
      primary.Content = "Reinstall / update";
      primary.IsEnabled = true;
      RefreshInstalledActions();
    }
    else
    {
      status.Text = $"Install failed with exit code {code}.";
      primary.Content = "Retry install";
      primary.IsEnabled = true;
      RefreshInstalledActions();
    }
  }

  void Launch(string command)
  {
    var shim = InstalledShimPath();
    if (!File.Exists(shim))
    {
      Append($"Cannot find installed command: {shim}");
      SetInstalledActions(false);
      return;
    }

    var args = string.IsNullOrWhiteSpace(command) ? $"/k \"{shim}\"" : $"/k \"{shim}\" {command}";
    Process.Start(new ProcessStartInfo("cmd.exe", args)
    {
      WorkingDirectory = IOPath.GetDirectoryName(shim) ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
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
        RedirectStandardInput = true,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        CreateNoWindow = true,
      },
      EnableRaisingEvents = true,
    };
    process.StartInfo.EnvironmentVariables["CODY_LAUNCHER_UI"] = "1";

    var done = new TaskCompletionSource<int>();
    process.OutputDataReceived += (_, e) => { if (e.Data != null) Dispatcher.Invoke(() => HandleOutputLine(e.Data)); };
    process.ErrorDataReceived += (_, e) => { if (e.Data != null) Dispatcher.Invoke(() => HandleOutputLine(e.Data)); };
    process.Exited += (_, _) => done.TrySetResult(process.ExitCode);
    try
    {
      process.Start();
      activeInstallerProcess = process;
      process.BeginOutputReadLine();
      process.BeginErrorReadLine();
      var code = await done.Task;
      return code;
    }
    finally
    {
      activeInstallerProcess = null;
      Dispatcher.Invoke(() => ShowPrompt(false, "Installer process finished."));
      process.Dispose();
    }
  }

  void HandleOutputLine(string text)
  {
    const string marker = "::codyx-prompt::";
    if (text.StartsWith(marker, StringComparison.Ordinal))
    {
      ShowPrompt(true, text[marker.Length..]);
      return;
    }
    Append(text);
  }

  void ShowPrompt(bool active, string message)
  {
    promptActive = active;
    promptIsCode = IsCodePrompt(message);
    var isEmailConfirm = IsEmailConfirmationPrompt(message);
    promptPanel.Visibility = active ? Visibility.Visible : Visibility.Collapsed;
    promptText.Text = message;
    promptAnswer.Text = "";
    promptAnswer.IsEnabled = active;
    promptSend.IsEnabled = active;
    promptCancel.IsEnabled = active;
    promptChangeEmail.IsEnabled = active && (promptIsCode || isEmailConfirm);
    promptResend.IsEnabled = active && promptIsCode;
    promptChangeEmail.Visibility = promptChangeEmail.IsEnabled ? Visibility.Visible : Visibility.Collapsed;
    promptResend.Visibility = promptResend.IsEnabled ? Visibility.Visible : Visibility.Collapsed;
    promptChangeEmail.Content = isEmailConfirm ? "Re-enter email" : "Change email";
    promptSend.Content = isEmailConfirm ? "Use email" : promptIsCode ? "Verify" : "Send";
    promptAnswer.MaxLength = promptIsCode ? 6 : 0;
    promptAnswer.Width = promptIsCode ? 160 : double.NaN;
    if (active) promptAnswer.Focus();
  }

  void SendPromptAnswer(string value)
  {
    if (!promptActive || activeInstallerProcess is null || activeInstallerProcess.HasExited) return;
    try
    {
      activeInstallerProcess.StandardInput.WriteLine(value ?? "");
      var secret = promptIsCode && (value ?? "").Trim().Length > 0 && (value ?? "").Trim().All(char.IsDigit);
      Append($"> {(secret ? "******" : value)}");
      ShowPrompt(false, "Waiting for installer prompt...");
    }
    catch (Exception ex)
    {
      Append($"Could not send installer answer: {ex.Message}");
    }
  }

  void Append(string text)
  {
    log.AppendText(text + Environment.NewLine);
    log.ScrollToEnd();
  }

  void RefreshInstalledActions()
  {
    SetInstalledActions(File.Exists(InstalledShimPath()));
  }

  void SetInstalledActions(bool enabled)
  {
    cli.IsEnabled = enabled;
    web.IsEnabled = enabled;
    uninstall.IsEnabled = enabled;
  }

  static string InstalledShimPath()
  {
    var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    return IOPath.Combine(local, "Programs", "Codyx-Orchestrator", "bin", "codyx.cmd");
  }

  static bool IsCodePrompt(string message)
  {
    return message.Contains("Enter code", StringComparison.OrdinalIgnoreCase) ||
      message.Contains("six-digit code", StringComparison.OrdinalIgnoreCase);
  }

  static bool IsEmailConfirmationPrompt(string message)
  {
    return message.StartsWith("Use email ", StringComparison.OrdinalIgnoreCase);
  }

  static string PowerShellPath()
  {
    var systemRoot = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
    return IOPath.Combine(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  }

  static string ExtractScripts()
  {
    var dir = IOPath.Combine(IOPath.GetTempPath(), "codyx-end-user-installer");
    Directory.CreateDirectory(dir);
    var installer = IOPath.Combine(dir, "install-compiled.ps1");
    ExtractResource("Codyx.EndUserInstaller.Resources.install-compiled.ps1", installer);
    ExtractResource("Codyx.EndUserInstaller.Resources.installer-verification.ps1", IOPath.Combine(dir, "installer-verification.ps1"));
    return installer;
  }

  static void ExtractResource(string resourceName, string target)
  {
    using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName)
      ?? throw new InvalidOperationException($"Embedded resource was not found: {resourceName}");
    using var output = File.Create(target);
    stream.CopyTo(output);
  }

  static string? LocalManifestPath()
  {
    var exePath = Environment.ProcessPath;
    var exeDir = string.IsNullOrWhiteSpace(exePath) ? AppContext.BaseDirectory : IOPath.GetDirectoryName(exePath);
    if (string.IsNullOrWhiteSpace(exeDir)) return null;
    var manifest = IOPath.Combine(exeDir, "codyx-release-manifest.json");
    return File.Exists(manifest) ? manifest : null;
  }
}
