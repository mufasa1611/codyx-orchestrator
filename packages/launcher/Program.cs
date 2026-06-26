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

namespace Codyx.Launcher;

public static class Program
{
  public const string LicenseUrl = "https://install.kingkung.men/license";

  [STAThread]
  public static void Main(string[] args)
  {
    var app = new Application
    {
      ShutdownMode = ShutdownMode.OnMainWindowClose,
    };
    app.Run(new LauncherWindow());
  }
}

public sealed class LauncherWindow : Window
{
  readonly List<StepRow> steps = [];
  readonly TextBox logBox = new();
  readonly Button primaryButton = new();
  readonly Button detailsButton = new();
  readonly Border licensePanel = new();
  readonly Border setupInputPanel = new();
  readonly TextBlock setupPromptText = new();
  readonly TextBox setupInput = new();
  readonly Button setupSendButton = new();
  readonly StackPanel stepPanel = new();
  readonly TextBlock statusText = new();
  readonly string installRoot;
  string launcherScript = "";
  bool detailsVisible;
  Process? setupProcess;
  RoutedEventHandler? primaryHandler;
  bool setupPromptActive;

  public LauncherWindow()
  {
    installRoot = ResolveInstallRoot();
    ConfigureWindow();
    Content = BuildLayout();
    Loaded += async (_, _) => await StartAsync();
  }

  void ConfigureWindow()
  {
    Title = "codyx Launcher";
    Width = 720;
    Height = 860;
    MinWidth = 620;
    MinHeight = 760;
    WindowStartupLocation = WindowStartupLocation.CenterScreen;
    Background = new SolidColorBrush(Color.FromRgb(9, 12, 18));
  }

  UIElement BuildLayout()
  {
    var root = new Grid();
    root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
    root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

    root.Children.Add(BuildBanner());

    var body = new StackPanel
    {
      Margin = new Thickness(32, 26, 32, 24),
    };
    Grid.SetRow(body, 1);

    body.Children.Add(new Image
    {
      Source = new BitmapImage(new Uri("pack://application:,,,/Assets/mufasa.png")),
      Height = 180,
      Stretch = Stretch.Uniform,
      HorizontalAlignment = HorizontalAlignment.Center,
      Margin = new Thickness(0, 0, 0, 18),
    });

    body.Children.Add(new TextBlock
    {
      Text = "welcome to mufasa",
      Foreground = new SolidColorBrush(Color.FromRgb(35, 225, 126)),
      FontSize = 30,
      FontWeight = FontWeights.Bold,
      HorizontalAlignment = HorizontalAlignment.Center,
      Margin = new Thickness(0, 0, 0, 2),
    });

    body.Children.Add(new TextBlock
    {
      Text = "codyx multi agent build",
      Foreground = new SolidColorBrush(Color.FromRgb(214, 220, 231)),
      FontSize = 17,
      HorizontalAlignment = HorizontalAlignment.Center,
      Margin = new Thickness(0, 0, 0, 24),
    });

    statusText.Text = "Getting codyx ready";
    statusText.Foreground = new SolidColorBrush(Color.FromRgb(165, 176, 195));
    statusText.FontSize = 14;
    statusText.Margin = new Thickness(0, 0, 0, 12);
    body.Children.Add(statusText);

    AddStep("Prerequisites", "Check Git and Bun");
    AddStep("Source", "Clone or update codyx");
    AddStep("Setup", "Run license, identity, and email verification");
    AddStep("Models", "Check Ollama and scan local models");
    AddStep("Launch", "Open the codyx experience");
    body.Children.Add(stepPanel);

    licensePanel.Visibility = Visibility.Collapsed;
    licensePanel.Margin = new Thickness(0, 22, 0, 0);
    licensePanel.Padding = new Thickness(18);
    licensePanel.CornerRadius = new CornerRadius(8);
    licensePanel.BorderBrush = new SolidColorBrush(Color.FromRgb(54, 65, 83));
    licensePanel.BorderThickness = new Thickness(1);
    licensePanel.Background = new SolidColorBrush(Color.FromRgb(17, 23, 34));
    licensePanel.Child = BuildLicensePanel();
    body.Children.Add(licensePanel);

    var actions = new StackPanel
    {
      Orientation = Orientation.Horizontal,
      HorizontalAlignment = HorizontalAlignment.Right,
      Margin = new Thickness(0, 18, 0, 0),
    };

    detailsButton.Content = "Show process";
    detailsButton.Margin = new Thickness(0, 0, 10, 0);
    detailsButton.Padding = new Thickness(16, 8, 16, 8);
    detailsButton.Click += (_, _) => ToggleDetails();
    actions.Children.Add(detailsButton);

    primaryButton.Content = "Preparing...";
    primaryButton.IsEnabled = false;
    primaryButton.Padding = new Thickness(18, 8, 18, 8);
    actions.Children.Add(primaryButton);
    body.Children.Add(actions);

    logBox.Visibility = Visibility.Collapsed;
    logBox.IsReadOnly = true;
    logBox.TextWrapping = TextWrapping.Wrap;
    logBox.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
    logBox.Height = 140;
    logBox.Margin = new Thickness(0, 16, 0, 0);
    logBox.Background = new SolidColorBrush(Color.FromRgb(7, 10, 15));
    logBox.Foreground = new SolidColorBrush(Color.FromRgb(202, 211, 224));
    logBox.BorderBrush = new SolidColorBrush(Color.FromRgb(54, 65, 83));
    body.Children.Add(logBox);

    setupInputPanel.Visibility = Visibility.Collapsed;
    setupInputPanel.Margin = new Thickness(0, 12, 0, 0);
    setupInputPanel.Padding = new Thickness(12);
    setupInputPanel.CornerRadius = new CornerRadius(8);
    setupInputPanel.BorderBrush = new SolidColorBrush(Color.FromRgb(54, 65, 83));
    setupInputPanel.BorderThickness = new Thickness(1);
    setupInputPanel.Background = new SolidColorBrush(Color.FromRgb(12, 18, 28));
    setupInputPanel.Child = BuildSetupInputPanel();
    body.Children.Add(setupInputPanel);

    root.Children.Add(body);
    return root;
  }

  UIElement BuildSetupInputPanel()
  {
    var panel = new StackPanel();
    setupPromptText.Text = "Waiting for installer prompt...";
    setupPromptText.Foreground = Brushes.White;
    setupPromptText.FontWeight = FontWeights.SemiBold;
    setupPromptText.Margin = new Thickness(0, 0, 0, 8);
    setupPromptText.TextWrapping = TextWrapping.Wrap;
    panel.Children.Add(setupPromptText);

    var row = new Grid();
    row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
    row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

    setupInput.Margin = new Thickness(0, 0, 10, 0);
    setupInput.MinHeight = 34;
    setupInput.Background = new SolidColorBrush(Color.FromRgb(7, 10, 15));
    setupInput.Foreground = Brushes.White;
    setupInput.BorderBrush = new SolidColorBrush(Color.FromRgb(54, 65, 83));
    setupInput.IsEnabled = false;
    setupInput.KeyDown += (_, e) =>
    {
      if (e.Key != Key.Enter) return;
      SendSetupInput();
      e.Handled = true;
    };
    row.Children.Add(setupInput);

    setupSendButton.Content = "Send";
    setupSendButton.Padding = new Thickness(16, 8, 16, 8);
    setupSendButton.IsEnabled = false;
    setupSendButton.Click += (_, _) => SendSetupInput();
    Grid.SetColumn(setupSendButton, 1);
    row.Children.Add(setupSendButton);

    panel.Children.Add(row);
    return panel;
  }

  UIElement BuildBanner()
  {
    var grid = new Grid
    {
      Height = 128,
      ClipToBounds = true,
      Background = new LinearGradientBrush(
        Color.FromRgb(10, 18, 30),
        Color.FromRgb(20, 38, 34),
        0),
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
      new DoubleAnimation(-360, 740, TimeSpan.FromSeconds(4.2))
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

  UIElement BuildLicensePanel()
  {
    var panel = new StackPanel();
    panel.Children.Add(new TextBlock
    {
      Text = "License agreement",
      Foreground = Brushes.White,
      FontWeight = FontWeights.Bold,
      FontSize = 18,
      Margin = new Thickness(0, 0, 0, 8),
    });
    panel.Children.Add(new TextBlock
    {
      Text = "codyx-orchestrator is distributed under the MIT License. Continue only if you agree to the license terms. The next setup window will ask for your name, email, and verification code.",
      Foreground = new SolidColorBrush(Color.FromRgb(202, 211, 224)),
      TextWrapping = TextWrapping.Wrap,
      Margin = new Thickness(0, 0, 0, 12),
    });
    var licenseLink = new Hyperlink(new Run($"License: {Program.LicenseUrl}"))
    {
      NavigateUri = new Uri(Program.LicenseUrl),
      Foreground = new SolidColorBrush(Color.FromRgb(77, 190, 255)),
    };
    licenseLink.RequestNavigate += (_, e) =>
    {
      Process.Start(new ProcessStartInfo(e.Uri.AbsoluteUri) { UseShellExecute = true });
      e.Handled = true;
    };
    panel.Children.Add(new TextBlock
    {
      Inlines = { licenseLink },
      TextWrapping = TextWrapping.Wrap,
      Margin = new Thickness(0, 0, 0, 14),
    });

    var buttons = new StackPanel
    {
      Orientation = Orientation.Horizontal,
      HorizontalAlignment = HorizontalAlignment.Right,
    };

    var decline = new Button
    {
      Content = "Decline",
      Padding = new Thickness(14, 8, 14, 8),
      Margin = new Thickness(0, 0, 10, 0),
    };
    decline.Click += (_, _) => Close();
    buttons.Children.Add(decline);

    var agree = new Button
    {
      Content = "Agree and continue",
      Padding = new Thickness(16, 8, 16, 8),
      Background = new SolidColorBrush(Color.FromRgb(35, 225, 126)),
      Foreground = Brushes.Black,
      FontWeight = FontWeights.Bold,
    };
    agree.Click += async (_, _) => await ContinueFirstRunAsync();
    buttons.Children.Add(agree);

    panel.Children.Add(buttons);
    return panel;
  }

  void AddStep(string title, string detail)
  {
    var row = new StepRow(title, detail);
    steps.Add(row);
    stepPanel.Children.Add(row.Root);
  }

  async Task StartAsync()
  {
    launcherScript = ExtractLauncherScript();
    SetStep(0, StepState.Active);
    await Task.Delay(350);
    SetStep(0, StepState.Done);
    SetStep(1, StepState.Active);

    if (!InstallComplete(installRoot))
    {
      statusText.Text = "First run needs your license agreement and verification.";
      SetStep(1, Directory.Exists(installRoot) ? StepState.Done : StepState.Active);
      SetStep(2, StepState.Active);
      SetPrimaryAction("Agree in the license panel", false, null);
      licensePanel.Visibility = Visibility.Visible;
      return;
    }

    await RunUpdateThenLaunchAsync();
  }

  async Task ContinueFirstRunAsync()
  {
    licensePanel.Visibility = Visibility.Collapsed;
    SetPrimaryAction("Setup running...", false, null);
    statusText.Text = "Complete identity and email verification below.";
    AppendLog("Starting setup with explicit license acceptance.");
    AppendLog("The answer box will unlock only when the installer asks for a real answer.");
    ShowDetails(true);
    ShowSetupInput(false, "Waiting for installer prompt...");

    SetStep(1, StepState.Done);
    SetStep(2, StepState.Active);

    var code = await RunInteractiveLauncherAsync(true);
    if (code == 0)
    {
      SetStep(2, StepState.Done);
      SetStep(3, StepState.Done);
      SetStep(4, StepState.Active);
      LaunchCodyx(true);
      SetStep(4, StepState.Done);
      statusText.Text = "codyx setup finished and launched.";
      SetPrimaryAction("Close", true, (_, _) => Close());
      return;
    }

    SetStep(2, StepState.Error);
    statusText.Text = "Setup did not finish. View details or run again.";
    SetPrimaryAction("Try again", true, async (_, _) => await ContinueFirstRunAsync());
  }

  async Task RunUpdateThenLaunchAsync()
  {
    statusText.Text = "Checking for updates before launch.";
    AppendLog("Running silent update check.");
    SetStep(1, StepState.Active);

    var code = await RunHiddenLauncherAsync();
    if (code != 0)
    {
      SetStep(1, StepState.Error);
      statusText.Text = "Update check failed. View details for the launcher log.";
      SetPrimaryAction("Open interactive setup", true, async (_, _) => await ContinueFirstRunAsync());
      return;
    }

    SetStep(1, StepState.Done);
    SetStep(2, StepState.Done);
    SetStep(3, StepState.Done);
    SetStep(4, StepState.Active);
    LaunchCodyx(false);
    SetStep(4, StepState.Done);
    statusText.Text = "codyx is launching.";
    SetPrimaryAction("Close", true, (_, _) => Close());
  }

  async Task<int> RunHiddenLauncherAsync()
  {
    return await RunProcessAsync(new ProcessStartInfo
    {
      FileName = PowerShellPath(),
      Arguments = $"-NoProfile -ExecutionPolicy Bypass -File \"{launcherScript}\" -NoLaunch",
      UseShellExecute = false,
      RedirectStandardOutput = true,
      RedirectStandardError = true,
      CreateNoWindow = true,
      WorkingDirectory = AppContext.BaseDirectory,
    });
  }

  async Task<int> RunInteractiveLauncherAsync(bool acceptedLicense)
  {
    var licenseArg = acceptedLicense ? " -AcceptLicense" : "";
    using var process = new Process
    {
      StartInfo = new ProcessStartInfo
      {
        FileName = PowerShellPath(),
        Arguments = $"-NoProfile -ExecutionPolicy Bypass -File \"{launcherScript}\"{licenseArg} -NoLaunch",
        UseShellExecute = false,
        RedirectStandardInput = true,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        CreateNoWindow = true,
        WorkingDirectory = AppContext.BaseDirectory,
      },
    };
    process.StartInfo.EnvironmentVariables["CODY_LAUNCHER_UI"] = "1";
    if (!process.Start()) return 1;
    setupProcess = process;
    var output = PumpOutputAsync(process.StandardOutput);
    var error = PumpOutputAsync(process.StandardError);
    await process.WaitForExitAsync();
    await Task.WhenAll(output, error);
    setupProcess = null;
    Dispatcher.Invoke(() => ShowSetupInput(false, "Setup finished."));
    return process.ExitCode;
  }

  async Task<int> RunProcessAsync(ProcessStartInfo startInfo)
  {
    using var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
    if (!process.Start()) return 1;
    var output = PumpOutputAsync(process.StandardOutput);
    var error = PumpOutputAsync(process.StandardError);
    await process.WaitForExitAsync();
    await Task.WhenAll(output, error);
    return process.ExitCode;
  }

  async Task PumpOutputAsync(StreamReader reader)
  {
    while (true)
    {
      var line = await reader.ReadLineAsync();
      if (line == null) return;
      AppendOutputLine(line);
    }
  }

  void LaunchCodyx(bool firstChatPrompt)
  {
    var command = IOPath.Combine(installRoot, "codyx.cmd");
    if (!File.Exists(command))
    {
      AppendLog($"Cannot find {command}");
      return;
    }

    var startInfo = new ProcessStartInfo
    {
      FileName = "cmd.exe",
      Arguments = firstChatPrompt
        ? $"/d /s /k \"set CODY_FIRST_CHAT_PROMPT=1&& \"\"{command}\"\"\""
        : $"/d /s /k \"\"{command}\"\"",
      UseShellExecute = true,
      WorkingDirectory = installRoot,
      WindowStyle = ProcessWindowStyle.Normal,
    };
    Process.Start(startInfo);
  }

  string ExtractLauncherScript()
  {
    var target = IOPath.Combine(IOPath.GetTempPath(), "codyx-launcher", "launcher.ps1");
    Directory.CreateDirectory(IOPath.GetDirectoryName(target)!);
    using var resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("Codyx.Launcher.Resources.launcher.ps1")
      ?? throw new InvalidOperationException("Embedded launcher.ps1 was not found.");
    using var file = File.Create(target);
    resource.CopyTo(file);
    return target;
  }

  static string ResolveInstallRoot()
  {
    var requested = Environment.GetEnvironmentVariable("CODY_INSTALL_ROOT");
    if (!string.IsNullOrWhiteSpace(requested)) return requested;

    var defaultRoot = IOPath.Combine(
      Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
      "codyx");
    if (IsCheckout(defaultRoot)) return defaultRoot;
    return IOPath.Combine(defaultRoot, "source");
  }

  static bool IsCheckout(string path)
  {
    return File.Exists(IOPath.Combine(path, "package.json"))
      && File.Exists(IOPath.Combine(path, "codyx.cmd"));
  }

  static bool InstallComplete(string path)
  {
    return IsCheckout(path) && File.Exists(IOPath.Combine(path, ".codyx-install-marker"));
  }

  static string PowerShellPath()
  {
    return IOPath.Combine(
      Environment.GetFolderPath(Environment.SpecialFolder.Windows),
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe");
  }

  void ToggleDetails()
  {
    ShowDetails(!detailsVisible);
  }

  void ShowDetails(bool visible)
  {
    detailsVisible = visible;
    logBox.Visibility = detailsVisible ? Visibility.Visible : Visibility.Collapsed;
    detailsButton.Content = detailsVisible ? "Hide process" : "Show process";
  }

  void AppendLog(string? line)
  {
    if (string.IsNullOrWhiteSpace(line)) return;
    AppendOutput(line + Environment.NewLine);
  }

  void AppendOutputLine(string line)
  {
    const string promptMarker = "::codyx-prompt::";
    if (line.StartsWith(promptMarker, StringComparison.Ordinal))
    {
      var prompt = line[promptMarker.Length..].Trim();
      Dispatcher.Invoke(() => ShowSetupInput(true, prompt));
      AppendOutput($"? {prompt}{Environment.NewLine}");
      return;
    }
    AppendOutput(line + Environment.NewLine);
  }

  void AppendOutput(string text)
  {
    if (string.IsNullOrEmpty(text)) return;
    Dispatcher.Invoke(() =>
    {
      if (text.Contains("installer email verification", StringComparison.OrdinalIgnoreCase)
        || text.Contains("verification code", StringComparison.OrdinalIgnoreCase))
      {
        SetStep(2, StepState.Active);
      }
      if (text.Contains("[codyx:model-scan]", StringComparison.OrdinalIgnoreCase)
        || text.Contains("Model discovery", StringComparison.OrdinalIgnoreCase))
      {
        SetStep(3, StepState.Active);
      }
      logBox.AppendText(text);
      logBox.ScrollToEnd();
    });
  }

  void SendSetupInput()
  {
    var value = setupInput.Text.Trim();
    if (string.IsNullOrEmpty(value)) return;
    if (!setupPromptActive) return;
    if (setupProcess == null || setupProcess.HasExited) return;
    setupInput.Clear();
    ShowSetupInput(false, "Waiting for next installer prompt...");
    setupProcess.StandardInput.WriteLine(value);
    AppendLog($"> {(value.Length == 6 && value.All(char.IsDigit) ? "******" : value)}");
  }

  void ShowSetupInput(bool active, string prompt)
  {
    setupInputPanel.Visibility = Visibility.Visible;
    setupPromptActive = active;
    setupPromptText.Text = prompt;
    setupInput.IsEnabled = active;
    setupSendButton.IsEnabled = active;
    if (active) setupInput.Focus();
  }

  void SetPrimaryAction(string content, bool enabled, RoutedEventHandler? handler)
  {
    if (primaryHandler != null) primaryButton.Click -= primaryHandler;
    primaryHandler = handler;
    if (primaryHandler != null) primaryButton.Click += primaryHandler;
    primaryButton.Content = content;
    primaryButton.IsEnabled = enabled;
  }

  void SetStep(int index, StepState state)
  {
    if (index >= 0 && index < steps.Count) steps[index].Set(state);
  }
}

public enum StepState
{
  Waiting,
  Active,
  Done,
  Error,
}

public sealed class StepRow
{
  public Grid Root { get; } = new();
  readonly Ellipse dot = new();
  readonly TextBlock titleBlock = new();
  readonly TextBlock detailBlock = new();

  public StepRow(string title, string detail)
  {
    Root.Margin = new Thickness(0, 0, 0, 10);
    Root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(34) });
    Root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

    dot.Width = 16;
    dot.Height = 16;
    dot.Fill = new SolidColorBrush(Color.FromRgb(74, 85, 104));
    dot.VerticalAlignment = VerticalAlignment.Top;
    dot.Margin = new Thickness(0, 4, 0, 0);
    Root.Children.Add(dot);

    var text = new StackPanel();
    Grid.SetColumn(text, 1);
    titleBlock.Text = title;
    titleBlock.Foreground = Brushes.White;
    titleBlock.FontWeight = FontWeights.SemiBold;
    detailBlock.Text = detail;
    detailBlock.Foreground = new SolidColorBrush(Color.FromRgb(154, 164, 181));
    detailBlock.FontSize = 13;
    text.Children.Add(titleBlock);
    text.Children.Add(detailBlock);
    Root.Children.Add(text);
  }

  public void Set(StepState state)
  {
    dot.Fill = state switch
    {
      StepState.Active => new SolidColorBrush(Color.FromRgb(77, 190, 255)),
      StepState.Done => new SolidColorBrush(Color.FromRgb(35, 225, 126)),
      StepState.Error => new SolidColorBrush(Color.FromRgb(255, 94, 105)),
      _ => new SolidColorBrush(Color.FromRgb(74, 85, 104)),
    };
    titleBlock.Foreground = state == StepState.Waiting
      ? new SolidColorBrush(Color.FromRgb(202, 211, 224))
      : Brushes.White;
  }
}
