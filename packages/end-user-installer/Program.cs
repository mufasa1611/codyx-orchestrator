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
using System.Windows.Threading;
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
  readonly Button close = new() { Content = "Close", Padding = new Thickness(16, 9, 16, 9) };
  readonly ComboBox releaseChannel = new() { MinWidth = 210, Margin = new Thickness(10, 0, 0, 0) };
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
  readonly TextBlock promptPrivacy = new()
  {
    TextWrapping = TextWrapping.Wrap,
    FontSize = 13,
    Margin = new Thickness(0, 0, 0, 10),
    Visibility = Visibility.Collapsed,
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
  readonly DispatcherTimer installHealthTimer = new() { Interval = TimeSpan.FromSeconds(1) };

  string scriptPath = "";
  Process? activeInstallerProcess;
  bool promptActive;
  bool promptIsCode;
  bool uninstallInProgress;
  bool installed;
  DateTime lastUpdateCheckUtc = DateTime.MinValue;
  bool updateCheckRunning;
  bool releaseChannelTouched;
  bool settingReleaseChannel;
  bool launcherActionInProgress;

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
      Text = "This installer downloads compiled release assets with SHA256 verification.",
    };
    header.Children.Add(license);

    var license2 = new TextBlock
    {
      Foreground = new SolidColorBrush(Color.FromRgb(203, 213, 225)),
      TextWrapping = TextWrapping.Wrap,
      Margin = new Thickness(0, 4, 0, 0),
      FontSize = 14,
    };
    license2.Inlines.Add("By continuing, you agree to the ");
    license2.Inlines.Add(SparkleLink("license terms", "https://install.kingkung.men/license"));
    license2.Inlines.Add(" and acknowledge the ");
    license2.Inlines.Add(SparkleLink("privacy notice", "https://install.kingkung.men/privacy"));
    license2.Inlines.Add(".");
    header.Children.Add(license2);

    releaseChannel.Items.Add(new ComboBoxItem { Content = "Stable release", Tag = "prod" });
    releaseChannel.Items.Add(new ComboBoxItem { Content = "Beta / pre-release", Tag = "beta" });
    releaseChannel.SelectedIndex = 0;
    releaseChannel.SelectionChanged += (_, _) =>
    {
      if (settingReleaseChannel) return;
      releaseChannelTouched = true;
      lastUpdateCheckUtc = DateTime.MinValue;
      QueueUpdateCheck();
    };
    var channelRow = new StackPanel
    {
      Orientation = Orientation.Horizontal,
      HorizontalAlignment = HorizontalAlignment.Center,
      Margin = new Thickness(0, 0, 16, 0),
    };
    channelRow.Children.Add(new TextBlock
    {
      Text = "Update channel",
      Foreground = new SolidColorBrush(Color.FromRgb(203, 213, 225)),
      FontSize = 14,
      FontWeight = FontWeights.SemiBold,
      VerticalAlignment = VerticalAlignment.Center,
    });
    channelRow.Children.Add(releaseChannel);

    var actionRow = new DockPanel { Margin = new Thickness(0, 0, 0, 14) };
    DockPanel.SetDock(actionRow, Dock.Bottom);
    root.Children.Add(actionRow);

    DockPanel.SetDock(channelRow, Dock.Left);
    actionRow.Children.Add(channelRow);

    var buttons = new StackPanel
    {
      Orientation = Orientation.Horizontal,
      HorizontalAlignment = HorizontalAlignment.Right,
    };
    actionRow.Children.Add(buttons);

    foreach (var button in new[] { close, uninstall, cli, web, primary })
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
    promptRoot.Children.Add(promptPrivacy);
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
    close.Click += (_, _) => Close();
    promptSend.Click += (_, _) => SendPromptAnswer(promptAnswer.Text);
    promptCancel.Click += (_, _) => SendPromptAnswer("cancel");
    promptChangeEmail.Click += (_, _) => SendPromptAnswer(IsEmailConfirmationPrompt(promptText.Text) ? "n" : "change-email");
    promptResend.Click += (_, _) => SendPromptAnswer("resend");
    BuildPromptPrivacyNotice();
    promptAnswer.KeyDown += (_, e) =>
    {
      if (e.Key == Key.Enter)
      {
        SendPromptAnswer(promptAnswer.Text);
        e.Handled = true;
      }
    };
    RefreshInstalledActions(false);
    Activated += (_, _) => RefreshInstalledActions();
    installHealthTimer.Tick += (_, _) => RefreshInstalledActions();
    installHealthTimer.Start();
    Loaded += async (_, _) =>
    {
      if (GetInstallHealth().Ready)
      {
        primary.IsEnabled = false;
        SetInstalledActions(false);
        status.Text = "Auto-checking for updates...";
        log.Clear();
        Append("[update] Auto-checking installed Codyx-Orchestrator on startup.");
        await RunEmbeddedInstallPreflightAsync();
        lastUpdateCheckUtc = DateTime.UtcNow;
        var updateOffered = await CheckForUpdateAsync();
        primary.IsEnabled = true;
        if (updateOffered) SetInstalledActions(true);
        else RefreshInstalledActions();
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

  void BuildPromptPrivacyNotice()
  {
    promptPrivacy.Inlines.Clear();
    promptPrivacy.Foreground = BuildSparkleBrush();
    promptPrivacy.Inlines.Add("Codyx uses your email only for installer verification and essential service notices.");
    promptPrivacy.Inlines.Add(new LineBreak());
    promptPrivacy.Inlines.Add(SparkleLink("Read Privacy Notes", "https://install.kingkung.men/privacy"));
  }

  async Task InstallAsync()
  {
    BeginLauncherAction(primary, "Installing...", "Installing Codyx-Orchestrator...");
    status.Text = "Complete identity and email verification, then install compiled release assets.";
    log.Clear();
    scriptPath = ExtractScripts();

    var channel = SelectedReleaseChannel();
    var args = $"-NoProfile -ExecutionPolicy Bypass -File \"{scriptPath}\" -AcceptLicense -NoLaunch -Channel {channel}";
    Append(channel == "beta" ? "Using beta/pre-release channel." : "Using stable release channel.");
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
      launcherActionInProgress = false;
      status.Text = "Codyx-Orchestrator is installed. Choose how to start.";
      primary.Content = "Reinstall / update";
      primary.IsEnabled = true;
      SetInstalledActions(true);
      RefreshInstalledActions();
    }
    else
    {
      launcherActionInProgress = false;
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
    var button = CommandButton(command);
    var action = CommandActionName(command);
    BeginLauncherAction(button, $"{action}...", $"{action} is starting. Checking updates and launch readiness...");
    Append($"[launch] {action} selected.");
    if (!isUninstall)
    {
      status.Text = $"{action} is checking installed Codyx-Orchestrator before launch...";
      var ready = await RunEmbeddedInstallPreflightAsync();
      if (!ready)
      {
        launcherActionInProgress = false;
        RefreshInstalledActions();
        status.Text = "Installed app is not launch-ready. Run install/update again.";
        return;
      }
    }
    else
    {
      uninstallInProgress = true;
      status.Text = "Uninstall started. Install/update is needed before CLI, Web UI, or Uninstall can run again.";
    }

    var shim = InstalledShimPath();
    if (!File.Exists(shim))
    {
      Append($"Cannot find installed command: {shim}");
      launcherActionInProgress = false;
      RefreshInstalledActions();
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
    try
    {
      Process.Start(new ProcessStartInfo("cmd.exe", args)
      {
        WorkingDirectory = workingDirectory,
        UseShellExecute = true,
      });
    }
    catch (Exception ex)
    {
      Append($"[launch] {action} failed: {ex.Message}");
      launcherActionInProgress = false;
      RefreshInstalledActions();
      return;
    }
    Append($"[launch] {action} opened in a new terminal.");
    launcherActionInProgress = false;
    RefreshInstalledActions();
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
    process.StartInfo.EnvironmentVariables["CODY_LAUNCHER_PATH"] = Environment.ProcessPath ?? "";

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
    var isEmail = IsEmailPrompt(message);
    promptPanel.Visibility = active ? Visibility.Visible : Visibility.Collapsed;
    promptText.Text = message;
    promptPrivacy.Visibility = active && isEmail ? Visibility.Visible : Visibility.Collapsed;
    promptAnswer.Text = "";
    if (isEmailConfirm && active)
    {
      var prefix = "Use email: ";
      var start = message.IndexOf(prefix, StringComparison.OrdinalIgnoreCase);
      if (start >= 0)
        promptAnswer.Text = message[(start + prefix.Length)..].Trim();
    }
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

  void RefreshInstalledActions(bool allowUpdateCheck = true)
  {
    if (launcherActionInProgress) return;
    if (activeInstallerProcess is { HasExited: false }) return;
    ResetActionLabels();
    var health = GetInstallHealth();
    if (!health.Ready) uninstallInProgress = false;
    installed = health.Ready;
    var ready = health.Ready;
    if (ready && !releaseChannelTouched) SetReleaseChannel(InstalledReleaseChannel());
    primary.IsEnabled = true;
    primary.Content = health.Ready ? "Check / repair update" : "Agree and install";
    SetInstalledActions(health.Ready && !uninstallInProgress);
    if (!ready)
    {
      status.Text = "Codyx-Orchestrator is not installed. Accept the license and install to continue.";
      return;
    }
    if (ready && uninstallInProgress)
    {
      status.Text = "Uninstall is open. Finish or close the uninstall terminal before launching again.";
    }
    else if (ready)
    {
      var channel = InstalledReleaseChannel();
      var selectedChannel = SelectedReleaseChannel();
      var parts = new List<string>
      {
        channel == "beta"
          ? "Codyx-Orchestrator is installed on beta/pre-release channel."
          : "Codyx-Orchestrator is installed on stable channel.",
      };
      if (selectedChannel != channel) parts.Add($"Selected channel: {ChannelLabel(selectedChannel)}.");
      if (!health.InPath) parts.Add("The 'codyx' command is not in your PATH. You can still launch from here.");
      status.Text = string.Join(" ", parts);
      if (allowUpdateCheck) QueueUpdateCheck();
    }
  }

  void QueueUpdateCheck()
  {
    if (launcherActionInProgress) return;
    if (activeInstallerProcess is { HasExited: false }) return;
    if (updateCheckRunning) return;
    if ((DateTime.UtcNow - lastUpdateCheckUtc) < TimeSpan.FromMinutes(5)) return;
    updateCheckRunning = true;
    lastUpdateCheckUtc = DateTime.UtcNow;
    _ = CheckForUpdateAsync().ContinueWith((_) =>
    {
      if (!Dispatcher.HasShutdownStarted) Dispatcher.Invoke(() => updateCheckRunning = false);
    });
  }

  void SetInstalledActions(bool enabled)
  {
    cli.IsEnabled = enabled;
    web.IsEnabled = enabled;
    uninstall.IsEnabled = enabled;
  }

  void BeginLauncherAction(Button button, string buttonText, string statusText)
  {
    launcherActionInProgress = true;
    primary.IsEnabled = false;
    SetInstalledActions(false);
    button.Content = buttonText;
    button.IsEnabled = false;
    status.Text = statusText;
  }

  void ResetActionLabels()
  {
    cli.Content = "Open CLI";
    web.Content = "Open Web UI";
    uninstall.Content = "Uninstall";
  }

  Button CommandButton(string command)
  {
    if (command.Equals("web", StringComparison.OrdinalIgnoreCase)) return web;
    if (command.Equals("uninstall", StringComparison.OrdinalIgnoreCase)) return uninstall;
    return cli;
  }

  static string CommandActionName(string command)
  {
    if (command.Equals("web", StringComparison.OrdinalIgnoreCase)) return "Web UI";
    if (command.Equals("uninstall", StringComparison.OrdinalIgnoreCase)) return "Uninstall";
    return "CLI";
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

  string SelectedReleaseChannel()
  {
    if (releaseChannel.SelectedItem is ComboBoxItem item && item.Tag is string tag) return NormalizeReleaseChannel(tag);
    return "prod";
  }

  void SetReleaseChannel(string channel)
  {
    settingReleaseChannel = true;
    releaseChannel.SelectedIndex = NormalizeReleaseChannel(channel) == "beta" ? 1 : 0;
    settingReleaseChannel = false;
  }

  static string NormalizeReleaseChannel(string? channel)
  {
    var value = (channel ?? "").Trim().ToLowerInvariant();
    return value is "beta" or "prerelease" or "pre-release" or "preview" ? "beta" : "prod";
  }

  static bool IsPrereleaseVersion(string? version)
  {
    return !string.IsNullOrWhiteSpace(version) && version.Contains('-');
  }

  static string InstalledReleaseChannel()
  {
    var channel = ReadInstalledMarkerString("channel");
    if (!string.IsNullOrWhiteSpace(channel)) return NormalizeReleaseChannel(channel);
    return IsPrereleaseVersion(InstalledReleaseVersion()) ? "beta" : "prod";
  }

  static string? InstalledReleaseVersion()
  {
    return ReadInstalledMarkerString("version");
  }

  static string? ReadInstalledMarkerString(string property)
  {
    try
    {
      var markerPath = RootMarkerPath();
      if (!File.Exists(markerPath)) return null;
      using var marker = System.Text.Json.JsonDocument.Parse(File.ReadAllText(markerPath));
      if (!marker.RootElement.TryGetProperty("compiledInstall", out var compiled)) return null;
      if (!compiled.TryGetProperty(property, out var value)) return null;
      return value.GetString();
    }
    catch
    {
      return null;
    }
  }

  sealed record InstallHealth(bool Ready, bool InPath, IReadOnlyList<string> Missing);

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

    var inPath = CheckInPath();

    return new InstallHealth(missing.Count == 0, inPath, missing);
  }

  static bool CheckInPath()
  {
    try
    {
      using var proc = new System.Diagnostics.Process
      {
        StartInfo = new System.Diagnostics.ProcessStartInfo
        {
          FileName = "where.exe",
          Arguments = "codyx.cmd",
          UseShellExecute = false,
          CreateNoWindow = true,
          RedirectStandardOutput = true,
          RedirectStandardError = true,
        }
      };
      proc.Start();
      proc.WaitForExit(3000);
      return proc.ExitCode == 0;
    }
    catch
    {
      return false;
    }
  }

  async Task<bool> CheckForUpdateAsync()
  {
    try
    {
      var currentVer = InstalledReleaseVersion();
      if (string.IsNullOrEmpty(currentVer))
      {
        Append("[update] Could not read installed version from marker.");
        return false;
      }
      var channel = SelectedReleaseChannel();
      Append($"[update] Checking {ChannelLabel(channel)} channel against installed v{currentVer}.");

      using var http = new System.Net.Http.HttpClient();
      http.DefaultRequestHeaders.Add("User-Agent", "Codyx-Orchestrator-Installer");
      http.Timeout = TimeSpan.FromSeconds(10);
      var latestInfo = await GetLatestReleaseForChannelAsync(http, channel);
      var latestVer = latestInfo.Tag?.TrimStart('v');
      if (string.IsNullOrEmpty(latestVer))
      {
        Append("[update] Could not parse latest version from GitHub response.");
        return false;
      }

      var shouldOffer = CompareReleaseVersions(latestVer, currentVer) > 0;
      if (channel == "beta" && latestInfo.StableFallback && currentVer.Contains('-')) shouldOffer = true;
      if (!shouldOffer)
      {
        Append($"[update] Already up-to-date ({ChannelLabel(channel)}, v{currentVer}).");
        return false;
      }

      var fallbackText = latestInfo.StableFallback ? " stable fallback" : "";
      Append($"[update] New{fallbackText} version available: v{currentVer} → v{latestVer}");
      await Dispatcher.InvokeAsync(() =>
      {
        primary.Content = $"Update to v{latestVer}";
        primary.IsEnabled = true;
        status.Text = $"A newer version (v{latestVer}) is available";
      });
      return true;
    }
    catch (Exception ex)
    {
      Append($"[update] Check failed: {ex.Message}");
      return false;
    }
  }

  static string ChannelLabel(string channel)
  {
    return NormalizeReleaseChannel(channel) == "beta" ? "beta/pre-release" : "stable";
  }

  async Task<(string? Tag, bool StableFallback)> GetLatestReleaseForChannelAsync(System.Net.Http.HttpClient http, string channel)
  {
    if (NormalizeReleaseChannel(channel) == "beta")
    {
      var prereleaseResp = await http.GetAsync("https://api.github.com/repos/mufasa1611/codyx-orchestrator/releases?per_page=20");
      if (prereleaseResp.IsSuccessStatusCode)
      {
        using var releases = System.Text.Json.JsonDocument.Parse(await prereleaseResp.Content.ReadAsStringAsync());
        foreach (var release in releases.RootElement.EnumerateArray())
        {
          var draft = release.TryGetProperty("draft", out var draftProp) && draftProp.GetBoolean();
          var prerelease = release.TryGetProperty("prerelease", out var prereleaseProp) && prereleaseProp.GetBoolean();
          if (draft || !prerelease) continue;
          return (release.GetProperty("tag_name").GetString(), false);
        }
      }
      else
      {
        return (null, false);
      }
    }

    var stableResp = await http.GetAsync("https://api.github.com/repos/mufasa1611/codyx-orchestrator/releases/latest");
    if (!stableResp.IsSuccessStatusCode)
    {
      Append($"[update] GitHub API returned {stableResp.StatusCode}, skipping check.");
      return (null, NormalizeReleaseChannel(channel) == "beta");
    }
    using var stableRelease = System.Text.Json.JsonDocument.Parse(await stableResp.Content.ReadAsStringAsync());
    return (stableRelease.RootElement.GetProperty("tag_name").GetString(), NormalizeReleaseChannel(channel) == "beta");
  }

  static int CompareReleaseVersions(string left, string right)
  {
    var a = ParseReleaseVersion(left);
    var b = ParseReleaseVersion(right);
    for (var i = 0; i < 3; i++)
    {
      var diff = a.Base[i].CompareTo(b.Base[i]);
      if (diff != 0) return diff;
    }
    if (a.Pre.Length == 0 && b.Pre.Length == 0) return 0;
    if (a.Pre.Length == 0) return 1;
    if (b.Pre.Length == 0) return -1;
    var count = Math.Max(a.Pre.Length, b.Pre.Length);
    for (var i = 0; i < count; i++)
    {
      if (i >= a.Pre.Length) return -1;
      if (i >= b.Pre.Length) return 1;
      var leftPart = a.Pre[i];
      var rightPart = b.Pre[i];
      var leftNum = int.TryParse(leftPart, out var ln);
      var rightNum = int.TryParse(rightPart, out var rn);
      if (leftNum && rightNum)
      {
        var diff = ln.CompareTo(rn);
        if (diff != 0) return diff;
        continue;
      }
      var textDiff = string.Compare(leftPart, rightPart, StringComparison.OrdinalIgnoreCase);
      if (textDiff != 0) return textDiff;
    }
    return 0;
  }

  static (int[] Base, string[] Pre) ParseReleaseVersion(string version)
  {
    var normalized = version.Trim().TrimStart('v', 'V');
    var pieces = normalized.Split('-', 2, StringSplitOptions.RemoveEmptyEntries);
    var baseParts = pieces[0].Split('.', StringSplitOptions.RemoveEmptyEntries);
    var parsed = new[] { 0, 0, 0 };
    for (var i = 0; i < Math.Min(3, baseParts.Length); i++)
    {
      _ = int.TryParse(baseParts[i], out parsed[i]);
    }
    var pre = pieces.Length > 1 ? pieces[1].Split('.', StringSplitOptions.RemoveEmptyEntries) : [];
    return (parsed, pre);
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
      var escaped = text.Replace("\\", "\\\\");
      if (!content.Contains(text, StringComparison.OrdinalIgnoreCase) && !content.Contains(escaped, StringComparison.OrdinalIgnoreCase))
      {
        missing.Add($"{label} is stale or invalid: {path}");
        return;
      }
    }
  }

  bool HasRunnableInstall()
  {
    return GetInstallHealth().Ready;
  }

  async Task<bool> RunEmbeddedInstallPreflightAsync()
  {
    scriptPath = ExtractScripts();
    var channel = SelectedReleaseChannel();
    Append($"[update] Running launch preflight on {ChannelLabel(channel)} channel.");
    var args = $"-NoProfile -ExecutionPolicy Bypass -File \"{scriptPath}\" -AcceptLicense -Quiet -NoLaunch -Channel {channel}";
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
    return message.StartsWith("Use email:", StringComparison.OrdinalIgnoreCase) ||
      message.StartsWith("Use email ", StringComparison.OrdinalIgnoreCase);
  }

  static bool IsEmailPrompt(string message)
  {
    return message.StartsWith("Email address", StringComparison.OrdinalIgnoreCase);
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
