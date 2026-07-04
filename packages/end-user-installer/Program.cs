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
  readonly StackPanel codeRow = new() { Orientation = Orientation.Horizontal, Visibility = Visibility.Collapsed };
  readonly TextBox[] codeBoxes = new TextBox[6];
  readonly Button promptSend = new() { Content = "Send", Padding = new Thickness(14, 7, 14, 7), IsEnabled = false };
  readonly Button promptCancel = new() { Content = "Cancel", Padding = new Thickness(14, 7, 14, 7), IsEnabled = false };
  readonly Button promptChangeEmail = new() { Content = "Change email", Padding = new Thickness(14, 7, 14, 7), IsEnabled = false, Visibility = Visibility.Collapsed };
  readonly Button promptResend = new() { Content = "Resend", Padding = new Thickness(14, 7, 14, 7), IsEnabled = false, Visibility = Visibility.Collapsed };

  string scriptPath = "";
  Process? activeInstallerProcess;
  bool promptActive;
  bool promptIsCode;
  bool uninstallInProgress;
  bool installed;

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
      FontSize = 14,
    };
    license.Inlines.Add("This installer downloads compiled release assets with SHA256 verification. By continuing, you agree to the ");
    license.Inlines.Add(SparkleLink("license terms", "https://install.kingkung.men/license"));
    license.Inlines.Add(" and acknowledge the ");
    license.Inlines.Add(SparkleLink("privacy notice", "https://install.kingkung.men/privacy"));
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
    BuildCodeInputs();
    promptRow.Children.Add(codeRow);
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
    cli.Click += async (_, _) => await LaunchAsync("");
    web.Click += async (_, _) => await LaunchAsync("web");
    uninstall.Click += async (_, _) => await LaunchAsync("uninstall");
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
    Activated += (_, _) => RefreshInstalledActions();
    Loaded += async (_, _) =>
    {
      if (GetInstallHealth().Ready)
      {
        primary.IsEnabled = false;
        SetInstalledActions(false);
        status.Text = "Auto-checking for updates...";
        log.Clear();
        await RunEmbeddedInstallPreflightAsync();
        primary.IsEnabled = true;
        RefreshInstalledActions();
      }
    };
  }

  void BuildCodeInputs()
  {
    codeRow.Margin = new Thickness(0, 0, 8, 0);
    for (int i = 0; i < 6; i++)
    {
      var idx = i;
      var box = new TextBox
      {
        Width = 34,
        MinHeight = 34,
        FontSize = 18,
        FontWeight = FontWeights.Bold,
        HorizontalContentAlignment = HorizontalAlignment.Center,
        VerticalContentAlignment = VerticalAlignment.Center,
        MaxLength = 1,
        Margin = new Thickness(0, 0, i < 5 ? 6 : 0, 0),
        Background = new SolidColorBrush(Color.FromRgb(7, 10, 15)),
        Foreground = Brushes.White,
        BorderBrush = new SolidColorBrush(Color.FromRgb(54, 65, 83)),
        IsEnabled = false,
        CaretBrush = Brushes.Transparent,
      };
      box.PreviewTextInput += (_, e) =>
      {
        if (!char.IsDigit(e.Text, 0))
        {
          e.Handled = true;
          return;
        }
        box.Text = e.Text;
        if (idx < 5) codeBoxes[idx + 1].Focus();
        else SendPromptAnswer();
        e.Handled = true;
      };
      box.PreviewKeyDown += (_, e) =>
      {
        if (e.Key == Key.V && (Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control)
        {
          try
          {
            var text = Clipboard.GetText().Trim();
            if (text.Length == 6 && text.All(char.IsDigit))
            {
              for (int k = 0; k < 6; k++) codeBoxes[k].Text = text[k].ToString();
              SendPromptAnswer();
              e.Handled = true;
              return;
            }
          }
          catch { }
        }
        if (e.Key == Key.Back && string.IsNullOrEmpty(box.Text) && idx > 0)
        {
          codeBoxes[idx - 1].Focus();
          codeBoxes[idx - 1].Text = "";
          e.Handled = true;
        }
      };
      codeBoxes[i] = box;
      codeRow.Children.Add(box);
    }
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

  static Hyperlink SparkleLink(string text, string url)
  {
    var link = Link(text, url);
    link.Foreground = BuildSparkleBrush();
    return link;
  }

  static Brush BuildSparkleBrush()
  {
    var brush = new LinearGradientBrush(new GradientStopCollection
    {
      new(Color.FromRgb(100, 180, 255), 0.0),
      new(Color.FromRgb(100, 180, 255), 0.3),
      new(Colors.White, 0.45),
      new(Colors.White, 0.55),
      new(Color.FromRgb(100, 180, 255), 0.7),
      new(Color.FromRgb(100, 180, 255), 1.0),
    }, 0);
    var transform = new TranslateTransform(-1, 0);
    brush.RelativeTransform = transform;
    transform.BeginAnimation(
      TranslateTransform.XProperty,
      new DoubleAnimation(-1, 1, TimeSpan.FromSeconds(3))
      {
        RepeatBehavior = RepeatBehavior.Forever,
      });
    return brush;
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
      installed = true;
      status.Text = "Codyx-Orchestrator is installed. Choose how to start.";
      primary.Content = "Reinstall / update";
      primary.IsEnabled = true;
      SetInstalledActions(true);
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

  async Task LaunchAsync(string command)
  {
    if (!HasRunnableInstall())
    {
      Append("Codyx-Orchestrator is not fully installed yet. Run install/update first.");
      RefreshInstalledActions();
      return;
    }

    var isUninstall = command.Equals("uninstall", StringComparison.OrdinalIgnoreCase);
    if (!isUninstall)
    {
      primary.IsEnabled = false;
      SetInstalledActions(false);
      status.Text = "Checking installed Codyx-Orchestrator before launch...";
      var ready = await RunEmbeddedInstallPreflightAsync();
      primary.IsEnabled = true;
      RefreshInstalledActions();
      if (!ready)
      {
        status.Text = "Installed app is not launch-ready. Run install/update again.";
        return;
      }
    }
    else
    {
      uninstallInProgress = true;
      SetInstalledActions(false);
      primary.IsEnabled = true;
      status.Text = "Uninstall started. Install/update is needed before CLI, Web UI, or Uninstall can run again.";
    }

    var shim = InstalledShimPath();
    if (!File.Exists(shim))
    {
      Append($"Cannot find installed command: {shim}");
      SetInstalledActions(false);
      return;
    }

    var workingDirectory = isUninstall
      ? IOPath.GetTempPath()
      : IOPath.GetDirectoryName(shim) ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    var args = string.IsNullOrWhiteSpace(command)
      ? $"/k \"{shim}\""
      : isUninstall
        ? $"/k \"cd /d \"\"%TEMP%\"\" && \"\"{shim}\"\" {command}\""
        : $"/k \"{shim}\" {command}";
    Process.Start(new ProcessStartInfo("cmd.exe", args)
    {
      WorkingDirectory = workingDirectory,
      UseShellExecute = true,
    });
    if (!isUninstall) RefreshInstalledActions();
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
    promptAnswer.Visibility = promptIsCode ? Visibility.Collapsed : Visibility.Visible;
    promptAnswer.IsEnabled = active && !promptIsCode;
    codeRow.Visibility = promptIsCode ? Visibility.Visible : Visibility.Collapsed;
    foreach (var box in codeBoxes)
    {
      box.Text = "";
      box.IsEnabled = active && promptIsCode;
    }
    promptSend.IsEnabled = active;
    promptCancel.IsEnabled = active;
    promptChangeEmail.IsEnabled = active && (promptIsCode || isEmailConfirm);
    promptResend.IsEnabled = active && promptIsCode;
    promptChangeEmail.Visibility = promptChangeEmail.IsEnabled ? Visibility.Visible : Visibility.Collapsed;
    promptResend.Visibility = promptResend.IsEnabled ? Visibility.Visible : Visibility.Collapsed;
    promptChangeEmail.Content = isEmailConfirm ? "Re-enter email" : "Change email";
    promptSend.Content = isEmailConfirm ? "Use email" : promptIsCode ? "Verify" : "Send";
    promptAnswer.MaxLength = 0;
    promptAnswer.Width = double.NaN;
    if (active)
    {
      if (promptIsCode) codeBoxes[0].Focus();
      else promptAnswer.Focus();
    }
  }

  void SendPromptAnswer(string? forcedValue = null)
  {
    if (!promptActive || activeInstallerProcess is null || activeInstallerProcess.HasExited) return;
    var value = forcedValue ?? (promptIsCode ? string.Concat(codeBoxes.Select((box) => box.Text)) : promptAnswer.Text);
    if (promptIsCode && forcedValue is null && value.Length < 6)
    {
      Append("Enter all 6 verification digits.");
      foreach (var box in codeBoxes)
      {
        if (string.IsNullOrEmpty(box.Text))
        {
          box.Focus();
          break;
        }
      }
      return;
    }
    try
    {
      activeInstallerProcess.StandardInput.WriteLine(value ?? "");
      var secret = promptIsCode && (value ?? "").Trim().Length > 0 && (value ?? "").Trim().All(char.IsDigit);
      Append($"> {(secret ? "******" : value)}");
      foreach (var box in codeBoxes) box.Text = "";
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
    var health = GetInstallHealth();
    if (!health.Ready) uninstallInProgress = false;
    var ready = installed || health.Ready;
    SetInstalledActions(ready && !uninstallInProgress);
    primary.Content = ready ? "Check / repair update" : "Agree and install";
    if (ready && uninstallInProgress)
    {
      status.Text = "Uninstall is open. Finish or close the uninstall terminal before launching again.";
    }
    else if (ready)
    {
      status.Text = "Codyx-Orchestrator is installed. Choose how to start.";
    }
    else if (health.Missing.Count > 0)
    {
      status.Text = "Install/update is needed before CLI, Web UI, or Uninstall can run.";
    }
  }

  void SetInstalledActions(bool enabled)
  {
    cli.IsEnabled = enabled;
    web.IsEnabled = enabled;
    uninstall.IsEnabled = enabled;
  }

  static string InstalledShimPath()
  {
    return IOPath.Combine(InstallRoot(), "bin", "codyx.cmd");
  }

  static string InstallRoot()
  {
    var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    return IOPath.Combine(local, "Programs", "Codyx-Orchestrator");
  }

  static string InstalledCliPath()
  {
    return IOPath.Combine(InstallRoot(), "current", "codyx.exe");
  }

  static string InstalledUpdaterPath()
  {
    return IOPath.Combine(InstallRoot(), "updater", "install-compiled.ps1");
  }

  static string InstalledVerificationHelperPath()
  {
    return IOPath.Combine(InstallRoot(), "updater", "installer-verification.ps1");
  }

  static string RootMarkerPath()
  {
    return IOPath.Combine(InstallRoot(), ".codyx-install-marker");
  }

  static string InstallerMarkerPath()
  {
    return IOPath.Combine(InstallerStateDir(), "install-marker.json");
  }

  static string VerificationReceiptPath()
  {
    return IOPath.Combine(InstallerStateDir(), "verification.json");
  }

  static string InstallerStateDir()
  {
    var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    return IOPath.Combine(local, "codyx-installer");
  }

  sealed record InstallHealth(bool Ready, IReadOnlyList<string> Missing);

  static InstallHealth GetInstallHealth()
  {
    var required = new (string Label, string Path)[]
    {
      ("installed command", InstalledShimPath()),
      ("compiled CLI", InstalledCliPath()),
      ("updater script", InstalledUpdaterPath()),
      ("verification helper", InstalledVerificationHelperPath()),
      ("install marker", InstallerMarkerPath()),
      ("root install marker", RootMarkerPath()),
      ("verification receipt", VerificationReceiptPath()),
    };
    var missing = required.Where((item) => !File.Exists(item.Path)).Select((item) => $"{item.Label}: {item.Path}").ToList();
    if (!Directory.Exists(InstallRoot()))
    {
      missing.Add($"install root: {InstallRoot()}");
    }
    if (!Directory.Exists(IOPath.Combine(InstallRoot(), "current")))
    {
      missing.Add($"compiled CLI directory: {IOPath.Combine(InstallRoot(), "current")}");
    }
    if (!Directory.Exists(IOPath.Combine(InstallRoot(), "updater")))
    {
      missing.Add($"updater directory: {IOPath.Combine(InstallRoot(), "updater")}");
    }
    AddIfFileMissingRequiredText(InstalledShimPath(), "installed command", [InstalledCliPath(), InstalledUpdaterPath(), InstallRoot()], missing);
    AddIfFileMissingRequiredText(RootMarkerPath(), "root install marker", [InstallRoot()], missing);
    AddIfFileMissingRequiredText(InstallerMarkerPath(), "installer marker", [InstallRoot(), RootMarkerPath(), VerificationReceiptPath()], missing);
    AddIfFileMissingRequiredText(VerificationReceiptPath(), "verification receipt", ["install_id", "receipt"], missing);
    return new InstallHealth(missing.Count == 0, missing);
  }

  static void AddIfFileMissingRequiredText(string path, string label, IEnumerable<string> requiredText, List<string> missing)
  {
    if (!File.Exists(path)) return;
    string content;
    try
    {
      content = File.ReadAllText(path);
    }
    catch
    {
      missing.Add($"{label} unreadable: {path}");
      return;
    }

    foreach (var text in requiredText)
    {
      if (!content.Contains(text, StringComparison.OrdinalIgnoreCase))
      {
        missing.Add($"{label} is stale or invalid: {path}");
        return;
      }
    }
  }

  bool HasRunnableInstall()
  {
    return installed || GetInstallHealth().Ready;
  }

  async Task<bool> RunEmbeddedInstallPreflightAsync()
  {
    scriptPath = ExtractScripts();
    var args = $"-NoProfile -ExecutionPolicy Bypass -File \"{scriptPath}\" -AcceptLicense -Quiet -NoLaunch";
    var localManifest = LocalManifestPath();
    if (localManifest is not null)
    {
      args += $" -ManifestUrl \"{localManifest}\"";
      Append($"Using local release manifest: {localManifest}");
    }

    var code = await RunProcessAsync(PowerShellPath(), args);
    if (code != 0)
    {
      Append($"Launch preflight failed with exit code {code}.");
      return false;
    }
    return HasRunnableInstall();
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
