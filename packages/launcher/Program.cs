using System.Diagnostics;
using System.IO;
using System.Linq;
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
  readonly Button terminalButton = new();
  readonly Button webButton = new();
  readonly Button uninstallButton = new();
  readonly Border licensePanel = new();
  readonly Border launchChoicePanel = new();
  readonly Border setupInputPanel = new();
  readonly TextBlock setupPromptText = new();
  readonly TextBox setupInput = new();
  readonly StackPanel codeRow = new();
  readonly TextBox[] codeBoxes = new TextBox[6];
  readonly Button setupSendButton = new();
  readonly Button setupCancelButton = new();
  readonly Button resendButton = new();
  readonly Button promptChangeEmail = new() { Content = "Change email", Padding = new Thickness(10, 6, 10, 6), FontSize = 12, Margin = new Thickness(8, 0, 4, 0), Visibility = Visibility.Collapsed };
  readonly Button exitButton = new();
  Border modalScanPanel = null!;
  Border yesOption = null!;
  Border noOption = null!;
  readonly Rectangle progressOverlay = new();
  readonly StackPanel stepPanel = new();
  readonly TextBlock statusText = new();
  readonly string installRoot;
  string launcherScript = "";
  bool detailsVisible;
  bool scanSelected = true;
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
    Icon = new BitmapImage(new Uri("pack://application:,,,/Assets/mufasa.png"));
    var workArea = SystemParameters.WorkArea;
    Width = Math.Min(980, Math.Max(760, workArea.Width - 80));
    Height = Math.Min(1080, Math.Max(880, workArea.Height - 80));
    MinWidth = Math.Min(880, Width);
    MinHeight = Math.Min(880, Height);
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

    var wBrush = new LinearGradientBrush
    {
      StartPoint = new Point(0, 0),
      EndPoint = new Point(1, 0),
    };
    wBrush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 255, 255), 0.0));
    wBrush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 255, 255), 0.25));
    wBrush.GradientStops.Add(new GradientStop(Color.FromRgb(46, 204, 113), 0.4));
    wBrush.GradientStops.Add(new GradientStop(Color.FromRgb(120, 225, 160), 0.48));
    wBrush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 250, 200), 0.5)); // Sparkling golden-white center
    wBrush.GradientStops.Add(new GradientStop(Color.FromRgb(120, 225, 160), 0.52));
    wBrush.GradientStops.Add(new GradientStop(Color.FromRgb(46, 204, 113), 0.6));
    wBrush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 255, 255), 0.75));
    wBrush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 255, 255), 1.0));

    var wTrans = new TranslateTransform(-1.5, 0);
    wBrush.RelativeTransform = wTrans;

    body.Children.Add(new TextBlock
    {
      Text = "Welcome to Codyx",
      Foreground = wBrush,
      FontSize = 32,
      FontWeight = FontWeights.Bold,
      HorizontalAlignment = HorizontalAlignment.Center,
      Margin = new Thickness(0, 0, 0, 4),
    });

    body.Children.Add(new TextBlock
    {
      Text = "A multi-agent assistant",
      Foreground = new SolidColorBrush(Color.FromRgb(165, 176, 195)),
      FontSize = 16,
      FontWeight = FontWeights.SemiBold,
      HorizontalAlignment = HorizontalAlignment.Center,
      Margin = new Thickness(0, 0, 0, 6),
    });

    var cBrush = new LinearGradientBrush
    {
      StartPoint = new Point(0, 0),
      EndPoint = new Point(1, 0),
    };
    cBrush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 255, 255), 0.0));
    cBrush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 255, 255), 0.25));
    cBrush.GradientStops.Add(new GradientStop(Color.FromRgb(46, 204, 113), 0.4));
    cBrush.GradientStops.Add(new GradientStop(Color.FromRgb(120, 225, 160), 0.48));
    cBrush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 250, 200), 0.5)); // Sparkling golden-white center
    cBrush.GradientStops.Add(new GradientStop(Color.FromRgb(120, 225, 160), 0.52));
    cBrush.GradientStops.Add(new GradientStop(Color.FromRgb(46, 204, 113), 0.6));
    cBrush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 255, 255), 0.75));
    cBrush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 255, 255), 1.0));

    var cTrans = new TranslateTransform(1.5, 0);
    cBrush.RelativeTransform = cTrans;

    body.Children.Add(new TextBlock
    {
      Text = "by M. Farid (Mufasa)",
      Foreground = cBrush,
      FontSize = 18,
      FontWeight = FontWeights.SemiBold,
      FontFamily = new FontFamily("Segoe Script"),
      HorizontalAlignment = HorizontalAlignment.Center,
      Margin = new Thickness(0, 0, 0, 20),
    });

    wTrans.BeginAnimation(TranslateTransform.XProperty, new DoubleAnimation(-1.5, 1.5, TimeSpan.FromSeconds(6.0))
    {
      RepeatBehavior = RepeatBehavior.Forever,
      AutoReverse = false,
      EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut },
    });

    cTrans.BeginAnimation(TranslateTransform.XProperty, new DoubleAnimation(1.5, -1.5, TimeSpan.FromSeconds(6.0))
    {
      RepeatBehavior = RepeatBehavior.Forever,
      AutoReverse = false,
      EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut },
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

    launchChoicePanel.Visibility = Visibility.Collapsed;
    launchChoicePanel.Margin = new Thickness(0, 18, 0, 0);
    launchChoicePanel.Padding = new Thickness(18);
    launchChoicePanel.CornerRadius = new CornerRadius(8);
    launchChoicePanel.BorderBrush = new SolidColorBrush(Color.FromRgb(54, 65, 83));
    launchChoicePanel.BorderThickness = new Thickness(1);
    launchChoicePanel.Background = new SolidColorBrush(Color.FromRgb(17, 23, 34));
    launchChoicePanel.Child = BuildLaunchChoicePanel();
    body.Children.Add(launchChoicePanel);

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

    setupInputPanel.Visibility = Visibility.Collapsed;
    setupInputPanel.Margin = new Thickness(0, 8, 0, 0);
    setupInputPanel.Padding = new Thickness(8, 6, 8, 6);
    setupInputPanel.CornerRadius = new CornerRadius(6);
    setupInputPanel.BorderBrush = new SolidColorBrush(Color.FromRgb(54, 65, 83));
    setupInputPanel.BorderThickness = new Thickness(1);
    setupInputPanel.Background = new SolidColorBrush(Color.FromRgb(12, 18, 28));
    setupInputPanel.Child = BuildSetupInputPanel();
    body.Children.Add(setupInputPanel);

    logBox.Visibility = Visibility.Collapsed;
    logBox.IsReadOnly = true;
    logBox.TextWrapping = TextWrapping.Wrap;
    logBox.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
    logBox.Height = 140;
    logBox.Margin = new Thickness(0, 8, 0, 0);
    logBox.Background = new SolidColorBrush(Color.FromRgb(7, 10, 15));
    logBox.Foreground = new SolidColorBrush(Color.FromRgb(202, 211, 224));
    logBox.BorderBrush = new SolidColorBrush(Color.FromRgb(54, 65, 83));
    body.Children.Add(logBox);

    var scroll = new ScrollViewer
    {
      Content = body,
      VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
      HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
    };
    Grid.SetRow(scroll, 1);
    root.Children.Add(scroll);
    return root;
  }

  UIElement BuildSetupInputPanel()
  {
    var root = new Grid();

    var panel = new StackPanel();
    setupPromptText.Text = "Waiting for installer prompt...";
    setupPromptText.Foreground = Brushes.White;
    setupPromptText.FontWeight = FontWeights.SemiBold;
    setupPromptText.FontSize = 13;
    setupPromptText.Margin = new Thickness(0, 0, 0, 6);
    setupPromptText.TextWrapping = TextWrapping.Wrap;
    panel.Children.Add(setupPromptText);

    var inputArea = new StackPanel();

    setupInput.Margin = new Thickness(0, 0, 10, 6);
    setupInput.MinHeight = 28;
    setupInput.FontSize = 13;
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
    inputArea.Children.Add(setupInput);

    codeRow.Orientation = Orientation.Horizontal;
    codeRow.Margin = new Thickness(0, 0, 0, 6);
    for (int i = 0; i < 6; i++)
    {
      var idx = i;
      var box = new TextBox
      {
        Width = 34,
        MinHeight = 34,
        FontSize = 18,
        FontWeight = FontWeights.Bold,
        HorizontalAlignment = HorizontalAlignment.Center,
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
        if (!char.IsDigit(e.Text, 0)) { e.Handled = true; return; }
        box.Text = e.Text;
        if (idx < 5) codeBoxes[idx + 1].Focus();
        else SendSetupInput();
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
              SendSetupInput();
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
        }
      };
      codeBoxes[i] = box;
      codeRow.Children.Add(box);
    }

    resendButton.Content = "Resend";
    resendButton.Padding = new Thickness(10, 6, 10, 6);
    resendButton.FontSize = 12;
    resendButton.Margin = new Thickness(8, 0, 4, 0);
    resendButton.Visibility = Visibility.Collapsed;
    resendButton.Click += (_, _) => SendSetupInput("resend");
    codeRow.Children.Add(resendButton);

    promptChangeEmail.Click += (_, _) => SendSetupInput(IsEmailConfirmationPrompt(setupPromptText.Text) ? "n" : "change-email");
    codeRow.Children.Add(promptChangeEmail);

    exitButton.Content = "Exit";
    exitButton.Padding = new Thickness(10, 6, 10, 6);
    exitButton.FontSize = 12;
    exitButton.Margin = new Thickness(0, 0, 0, 0);
    exitButton.Visibility = Visibility.Collapsed;
    exitButton.Click += (_, _) => SendSetupInput("cancel");
    codeRow.Children.Add(exitButton);

    inputArea.Children.Add(codeRow);

    modalScanPanel = new Border();
    modalScanPanel.Visibility = Visibility.Collapsed;
    modalScanPanel.Margin = new Thickness(0, 4, 0, 6);
    modalScanPanel.Padding = new Thickness(4);
    modalScanPanel.CornerRadius = new CornerRadius(6);
    modalScanPanel.Background = new SolidColorBrush(Color.FromRgb(12, 18, 28));
    modalScanPanel.Focusable = true;
    modalScanPanel.IsEnabled = false;

    var scanStack = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
    scanStack.Children.Add(new TextBlock
    {
      Text = "Scan local Ollama models now?",
      Foreground = Brushes.White,
      FontWeight = FontWeights.SemiBold,
      FontSize = 13,
      HorizontalAlignment = HorizontalAlignment.Center,
      Margin = new Thickness(0, 4, 0, 10),
    });

    var scanButtons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center };

    yesOption = new Border
    {
      Width = 100,
      Padding = new Thickness(16, 8, 16, 8),
      CornerRadius = new CornerRadius(6),
      Background = new SolidColorBrush(Color.FromRgb(35, 225, 126)),
      BorderBrush = new SolidColorBrush(Color.FromRgb(35, 225, 126)),
      BorderThickness = new Thickness(2),
      Cursor = Cursors.Hand,
      Child = new TextBlock { Text = "  Yes  ", Foreground = Brushes.Black, FontWeight = FontWeights.Bold, FontSize = 14, HorizontalAlignment = HorizontalAlignment.Center },
      Margin = new Thickness(0, 0, 12, 0),
    };
    yesOption.MouseDown += (_, _) => SendSetupInput("y");

    noOption = new Border
    {
      Width = 100,
      Padding = new Thickness(16, 8, 16, 8),
      CornerRadius = new CornerRadius(6),
      Background = new SolidColorBrush(Color.FromRgb(60, 70, 90)),
      BorderBrush = new SolidColorBrush(Color.FromRgb(54, 65, 83)),
      BorderThickness = new Thickness(2),
      Cursor = Cursors.Hand,
      Child = new TextBlock { Text = "  No  ", Foreground = Brushes.White, FontWeight = FontWeights.Bold, FontSize = 14, HorizontalAlignment = HorizontalAlignment.Center },
    };
    noOption.MouseDown += (_, _) => SendSetupInput("n");

    scanButtons.Children.Add(yesOption);
    scanButtons.Children.Add(noOption);
    scanStack.Children.Add(scanButtons);
    modalScanPanel.Child = scanStack;

    modalScanPanel.PreviewKeyDown += (_, e) =>
    {
      if (e.Key == Key.Left || e.Key == Key.Right)
      {
        scanSelected = !scanSelected;
        UpdateScanSelection();
        e.Handled = true;
      }
      if (e.Key == Key.Enter || e.Key == Key.Space)
      {
        SendSetupInput(scanSelected ? "y" : "n");
        e.Handled = true;
      }
    };

    inputArea.Children.Add(modalScanPanel);
    panel.Children.Add(inputArea);

    var buttonRow = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 4, 0, 0) };

    setupCancelButton.Content = "Cancel";
    setupCancelButton.Padding = new Thickness(14, 6, 14, 6);
    setupCancelButton.FontSize = 13;
    setupCancelButton.Margin = new Thickness(0, 0, 8, 0);
    setupCancelButton.IsEnabled = false;
    setupCancelButton.Visibility = Visibility.Collapsed;
    setupCancelButton.Click += (_, _) => SendSetupInput("cancel");
    buttonRow.Children.Add(setupCancelButton);

    setupSendButton.Content = "Send";
    setupSendButton.Padding = new Thickness(16, 6, 16, 6);
    setupSendButton.FontSize = 13;
    setupSendButton.IsEnabled = false;
    setupSendButton.Click += (_, _) => SendSetupInput();
    buttonRow.Children.Add(setupSendButton);

    panel.Children.Add(buttonRow);
    root.Children.Add(panel);

    progressOverlay.Height = 4;
    progressOverlay.VerticalAlignment = VerticalAlignment.Bottom;
    progressOverlay.HorizontalAlignment = HorizontalAlignment.Stretch;
    progressOverlay.Visibility = Visibility.Collapsed;
    progressOverlay.IsHitTestVisible = false;
    progressOverlay.Opacity = 0.8;

    var progressBrush = new LinearGradientBrush
    {
      StartPoint = new Point(0, 0),
      EndPoint = new Point(1, 0),
      SpreadMethod = GradientSpreadMethod.Repeat,
    };
    var progressColors = new[] {
      Color.FromRgb(46, 204, 113),
      Color.FromRgb(52, 152, 219),
      Color.FromRgb(155, 89, 182),
      Color.FromRgb(231, 76, 60),
      Color.FromRgb(241, 196, 15),
      Color.FromRgb(46, 204, 113),
    };
    for (int i = 0; i < progressColors.Length; i++)
    {
      progressBrush.GradientStops.Add(new GradientStop(progressColors[i], (double)i / (progressColors.Length - 1)));
    }
    progressOverlay.Fill = progressBrush;

    var progressTrans = new TranslateTransform(0, 0);
    progressBrush.RelativeTransform = progressTrans;
    var progressAnim = new DoubleAnimation(0, 1, TimeSpan.FromSeconds(2))
    {
      RepeatBehavior = RepeatBehavior.Forever,
    };
    progressTrans.BeginAnimation(TranslateTransform.XProperty, progressAnim);

    root.Children.Add(progressOverlay);

    return root;
  }

  UIElement BuildLaunchChoicePanel()
  {
    var panel = new StackPanel();
    panel.Children.Add(new TextBlock
    {
      Text = "Choose how to start codyx",
      Foreground = Brushes.White,
      FontWeight = FontWeights.Bold,
      FontSize = 18,
      Margin = new Thickness(0, 0, 0, 6),
    });
    panel.Children.Add(new TextBlock
    {
      Text = "Updates are checked. Start the terminal experience, open the Web UI, or remove codyx from this Windows user.",
      Foreground = new SolidColorBrush(Color.FromRgb(202, 211, 224)),
      TextWrapping = TextWrapping.Wrap,
      Margin = new Thickness(0, 0, 0, 14),
    });

    var buttons = new StackPanel
    {
      Orientation = Orientation.Horizontal,
      HorizontalAlignment = HorizontalAlignment.Right,
    };

    terminalButton.Content = "Terminal UI";
    terminalButton.Padding = new Thickness(16, 9, 16, 9);
    terminalButton.Margin = new Thickness(0, 0, 10, 0);
    terminalButton.Background = new SolidColorBrush(Color.FromRgb(35, 225, 126));
    terminalButton.Foreground = Brushes.Black;
    terminalButton.FontWeight = FontWeights.Bold;
    terminalButton.Click += (_, _) => LaunchTerminalUi();
    buttons.Children.Add(terminalButton);

    webButton.Content = "Web UI";
    webButton.Padding = new Thickness(16, 9, 16, 9);
    webButton.Margin = new Thickness(0, 0, 10, 0);
    webButton.Click += (_, _) => LaunchWebUi();
    buttons.Children.Add(webButton);

    uninstallButton.Content = "Uninstall";
    uninstallButton.Padding = new Thickness(16, 9, 16, 9);
    uninstallButton.Click += async (_, _) => await BeginUninstallAsync();
    buttons.Children.Add(uninstallButton);

    panel.Children.Add(buttons);
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
      Text = "codyx-orchestrator is distributed under the MIT License.",
      Foreground = new SolidColorBrush(Color.FromRgb(202, 211, 224)),
      TextWrapping = TextWrapping.Wrap,
      Margin = new Thickness(0, 0, 0, 4),
    });
    panel.Children.Add(new TextBlock
    {
      Text = "Continue only if you agree to the license terms. The next setup window will ask for your name, email, and verification code.",
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
      OpenUri(e.Uri.AbsoluteUri);
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
    AppendLog("Starting first-run setup after license acceptance.");
    AppendLog("The answer box unlocks only when the installer asks for your name, email, or verification code.");
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
      ShowLaunchChoices();
      statusText.Text = "codyx setup finished. Choose how to start.";
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
      statusText.Text = "Update or repair failed. View details, then retry.";
      SetPrimaryAction("Retry update check", true, async (_, _) => await RunUpdateThenLaunchAsync());
      return;
    }

    SetStep(1, StepState.Done);
    SetStep(2, StepState.Done);
    SetStep(3, StepState.Done);
    SetStep(4, StepState.Active);
    ShowLaunchChoices();
    statusText.Text = "codyx is ready. Choose how to start.";
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

  void ShowLaunchChoices()
  {
    setupInputPanel.Visibility = Visibility.Collapsed;
    launchChoicePanel.Visibility = Visibility.Visible;
    terminalButton.IsEnabled = true;
    webButton.IsEnabled = true;
    uninstallButton.IsEnabled = true;
    SetPrimaryAction("Close", true, (_, _) => Close());
  }

  void LaunchTerminalUi()
  {
    if (!LaunchCodyx("--no-banner")) return;
    SetStep(4, StepState.Done);
    statusText.Text = "Terminal UI opened.";
  }

  void LaunchWebUi()
  {
    if (!LaunchCodyx("--launcher-web")) return;
    SetStep(4, StepState.Done);
    statusText.Text = "Web UI is starting in its terminal window.";
  }

  bool LaunchCodyx(string arguments)
  {
    var command = IOPath.Combine(installRoot, "codyx.cmd");
    if (!File.Exists(command))
    {
      AppendLog($"Cannot find {command}");
      statusText.Text = "Cannot find the installed codyx launcher.";
      return false;
    }

    var commandLine = string.IsNullOrWhiteSpace(arguments)
      ? $"\"{command}\""
      : $"\"{command}\" {arguments}";
    var startInfo = new ProcessStartInfo
    {
      FileName = "cmd.exe",
      Arguments = $"/d /s /k \"{commandLine}\"",
      UseShellExecute = true,
      WorkingDirectory = installRoot,
      WindowStyle = ProcessWindowStyle.Normal,
    };
    Process.Start(startInfo);
    return true;
  }

  async Task BeginUninstallAsync()
  {
    var result = MessageBox.Show(
      this,
      $"Remove codyx for this Windows user?\n\nInstall root:\n{installRoot}\n\nThis removes Codyx-owned folders, shims, shortcuts, temp launcher files, app data, and tools recorded as installed by Codyx.",
      "Uninstall codyx",
      MessageBoxButton.YesNo,
      MessageBoxImage.Warning);
    if (result != MessageBoxResult.Yes) return;

    terminalButton.IsEnabled = false;
    webButton.IsEnabled = false;
    uninstallButton.IsEnabled = false;
    SetPrimaryAction("Uninstalling...", false, null);
    statusText.Text = "Removing codyx from this Windows user.";
    ShowDetails(true);
    AppendLog("Starting uninstall from a temporary cleanup script.");

    var code = await RunProcessAsync(new ProcessStartInfo
    {
      FileName = PowerShellPath(),
      Arguments = $"-NoProfile -ExecutionPolicy Bypass -File \"{WriteTempUninstallScript()}\" -InstallRoot \"{installRoot}\"",
      UseShellExecute = false,
      RedirectStandardOutput = true,
      RedirectStandardError = true,
      CreateNoWindow = true,
      WorkingDirectory = AppContext.BaseDirectory,
    });

    if (code == 0)
    {
      launchChoicePanel.Visibility = Visibility.Collapsed;
      SetStep(4, StepState.Done);
      statusText.Text = "codyx was removed. You can close this window.";
      SetPrimaryAction("Close", true, (_, _) => Close());
      return;
    }

    SetStep(4, StepState.Error);
    statusText.Text = "Uninstall did not finish. View details and try again.";
    terminalButton.IsEnabled = true;
    webButton.IsEnabled = true;
    uninstallButton.IsEnabled = true;
    SetPrimaryAction("Try uninstall again", true, async (_, _) => await BeginUninstallAsync());
  }

  static string WriteTempUninstallScript()
  {
    var dir = IOPath.Combine(IOPath.GetTempPath(), $"codyx-uninstall-{Guid.NewGuid():N}");
    Directory.CreateDirectory(dir);
    var script = IOPath.Combine(dir, "remove-codyx.ps1");
    File.WriteAllText(script, """
param([string]$InstallRoot)

$ErrorActionPreference = "Continue"

function Remove-CodyxPath {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $Path) {
    Write-Host "[warn] Could not remove $Path"
    return
  }
  Write-Host "[ok] Removed $Path"
}

function Remove-CodyxFile {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $Path) {
    Write-Host "[warn] Could not remove $Path"
    return
  }
  Write-Host "[ok] Removed $Path"
}

function Read-CodyxMarker {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) { return $null }
  try { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json } catch { return $null }
}

function Get-ObjectArray {
  param($Value)
  if ($null -eq $Value) { return @() }
  if ($Value -is [array]) { return @($Value) }
  return @($Value)
}

function Remove-UserPathEntry {
  param([string]$Entry)
  if ([string]::IsNullOrWhiteSpace($Entry)) { return }
  try { $target = [System.IO.Path]::GetFullPath($Entry).TrimEnd("\") } catch { $target = $Entry.TrimEnd("\") }
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ([string]::IsNullOrWhiteSpace($userPath)) { return }
  $kept = @()
  $removed = $false
  foreach ($item in @($userPath -split ";")) {
    if ([string]::IsNullOrWhiteSpace($item)) { continue }
    $expanded = [Environment]::ExpandEnvironmentVariables($item)
    try { $normalized = [System.IO.Path]::GetFullPath($expanded).TrimEnd("\") } catch { $normalized = $expanded.TrimEnd("\") }
    if ($normalized.Equals($target, [System.StringComparison]::OrdinalIgnoreCase)) {
      $removed = $true
      continue
    }
    $kept += $item
  }
  if (-not $removed) { return }
  [Environment]::SetEnvironmentVariable("Path", (@($kept) -join ";"), "User")
  Write-Host "[ok] Removed PATH entry $Entry"
}

function Invoke-CodyxManagedToolCleanup {
  param($Marker)
  if ($null -eq $Marker -or -not ($Marker.PSObject.Properties.Name -contains "managedTools")) { return }
  foreach ($tool in (Get-ObjectArray $Marker.managedTools)) {
    foreach ($entry in (Get-ObjectArray $tool.pathAdds)) {
      Remove-UserPathEntry "$entry"
    }
    if ("$($tool.manager)" -eq "path") {
      Remove-CodyxPath "$($tool.path)"
      continue
    }
    if ("$($tool.manager)" -eq "winget" -and "$($tool.packageId)" -and (Get-Command winget -ErrorAction SilentlyContinue)) {
      Write-Host "[info] Removing $($tool.name) installed by codyx with winget."
      & winget uninstall --id "$($tool.packageId)" --exact --source winget --silent
      if ($LASTEXITCODE -eq 0) { Write-Host "[ok] Removed $($tool.name)" } else { Write-Host "[warn] Could not remove $($tool.name)" }
      continue
    }
    if ("$($tool.manager)" -eq "choco" -and "$($tool.packageId)" -and (Get-Command choco -ErrorAction SilentlyContinue)) {
      Write-Host "[info] Removing $($tool.name) installed by codyx with choco."
      & choco uninstall "$($tool.packageId)" -y --no-progress
      if ($LASTEXITCODE -eq 0) { Write-Host "[ok] Removed $($tool.name)" } else { Write-Host "[warn] Could not remove $($tool.name)" }
    }
  }
}

function Invoke-CodyxNpmCleanup {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npm) { return }
  Write-Host "[info] Removing global npm package codyx-ai if present."
  try {
    $process = Start-Process -FilePath $npm.Source -ArgumentList @("uninstall", "-g", "codyx-ai", "--silent") -NoNewWindow -PassThru
    if ($process.WaitForExit(20000)) {
      if ($process.ExitCode -eq 0) {
        Write-Host "[ok] npm global package cleanup finished."
      } else {
        Write-Host "[warn] npm global package cleanup exited with code $($process.ExitCode)."
      }
      return
    }
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    Write-Host "[warn] npm global package cleanup timed out and was skipped."
  } catch {
    Write-Host "[warn] npm global package cleanup failed."
  }
}

$local = [Environment]::GetFolderPath("LocalApplicationData")
$roaming = [Environment]::GetFolderPath("ApplicationData")
$user = [Environment]::GetFolderPath("UserProfile")
$temp = [System.IO.Path]::GetTempPath()
$installerState = Join-Path $local "codyx-installer"
$marker = Read-CodyxMarker (Join-Path $installerState "install-marker.json")
$checkoutMarker = if ([string]::IsNullOrWhiteSpace($InstallRoot)) { $null } else { Read-CodyxMarker (Join-Path $InstallRoot ".codyx-install-marker") }

Invoke-CodyxManagedToolCleanup $marker
Invoke-CodyxManagedToolCleanup $checkoutMarker

foreach ($shim in @("codyx", "cody", "cody-x", "codyx-ai")) {
  foreach ($extension in @("", ".cmd", ".ps1")) {
    Remove-CodyxFile (Join-Path (Join-Path $roaming "npm") "$shim$extension")
  }
}

foreach ($path in @(
  $InstallRoot,
  (Join-Path $local "codyx-installer"),
  (Join-Path $local "codyx"),
  (Join-Path $roaming "codyx"),
  (Join-Path $roaming "Microsoft\Windows\Start Menu\Programs\codyx"),
  (Join-Path $user ".codyx"),
  (Join-Path $user ".config\codyx"),
  (Join-Path $user ".local\share\codyx"),
  (Join-Path $user ".local\state\codyx"),
  (Join-Path $user ".cache\codyx"),
  (Join-Path $temp "codyx-launcher")
) | Select-Object -Unique) {
  Remove-CodyxPath $path
}

Invoke-CodyxNpmCleanup
Write-Host "[ok] codyx uninstall cleanup finished."

$self = $MyInvocation.MyCommand.Path
$parent = Split-Path -Parent $self
$escapedSelf = $self.Replace("'", "''")
$escapedParent = $parent.Replace("'", "''")
Start-Process -FilePath (Get-Process -Id $PID).Path -WindowStyle Hidden -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  "Start-Sleep -Milliseconds 800; Remove-Item -LiteralPath '$escapedSelf' -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath '$escapedParent' -Recurse -Force -ErrorAction SilentlyContinue"
)
""");
    return script;
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

  void SendSetupInput(string? forcedValue = null)
  {
    if (!setupPromptActive) return;
    if (setupProcess == null || setupProcess.HasExited) return;

    string value;
    if (forcedValue != null)
    {
      value = forcedValue;
    }
    else if (setupInput.Visibility == Visibility.Visible)
    {
      value = setupInput.Text.Trim();
    }
    else if (IsEmailConfirmationPrompt(setupPromptText.Text) && promptChangeEmail.Visibility == Visibility.Visible)
    {
      value = "y";
    }
    else
    {
      value = string.Concat(codeBoxes.Select(b => b.Text));
    }

    if (string.IsNullOrEmpty(value)) return;

    if (value == "change-email")
    {
      ShowEmailInput();
      return;
    }

    setupInput.Clear();
    foreach (var box in codeBoxes) box.Text = "";
    ShowSetupInput(false, "Waiting for next installer prompt...");
    setupProcess.StandardInput.WriteLine(value);
    AppendLog($"> {(value.Length == 6 && value.All(char.IsDigit) ? "******" : value)}");
  }

  void ShowSetupInput(bool active, string prompt)
  {
    setupInputPanel.Visibility = Visibility.Visible;
    setupPromptActive = active;
    RenderSetupPrompt(prompt);
    progressOverlay.Visibility = active ? Visibility.Collapsed : Visibility.Visible;

    bool isCodePrompt = active && (
      prompt.Contains("verification code", StringComparison.OrdinalIgnoreCase) ||
      prompt.Contains("Enter code", StringComparison.OrdinalIgnoreCase) ||
      prompt.Contains("six-digit code", StringComparison.OrdinalIgnoreCase) ||
      prompt.Contains("resend", StringComparison.OrdinalIgnoreCase)
    );

    bool isScanPrompt = active && prompt.Contains("Scan local", StringComparison.OrdinalIgnoreCase);
    bool isEmailConfirm = active && IsEmailConfirmationPrompt(prompt);

    codeRow.Visibility = isCodePrompt ? Visibility.Visible : Visibility.Collapsed;

    setupInput.Visibility = !isCodePrompt && !isScanPrompt && !isEmailConfirm ? Visibility.Visible : Visibility.Collapsed;
    setupInput.IsEnabled = active && !isCodePrompt && !isScanPrompt && !isEmailConfirm;

    foreach (var box in codeBoxes)
    {
      box.Visibility = isCodePrompt ? Visibility.Visible : Visibility.Collapsed;
      box.IsEnabled = active && isCodePrompt;
      box.Text = "";
    }

    resendButton.Visibility = isCodePrompt ? Visibility.Visible : Visibility.Collapsed;
    exitButton.Visibility = isCodePrompt ? Visibility.Visible : Visibility.Collapsed;

    promptChangeEmail.IsEnabled = active && (isCodePrompt || isEmailConfirm);
    promptChangeEmail.Visibility = promptChangeEmail.IsEnabled ? Visibility.Visible : Visibility.Collapsed;
    promptChangeEmail.Content = isEmailConfirm ? "Re-enter email" : "Change email";

    setupSendButton.Content = isEmailConfirm ? "Use email" : isCodePrompt ? "Verify" : "Send";

    modalScanPanel.Visibility = isScanPrompt ? Visibility.Visible : Visibility.Collapsed;
    modalScanPanel.IsEnabled = active && isScanPrompt;

    setupSendButton.IsEnabled = active && !isScanPrompt;
    setupCancelButton.Visibility = active && prompt.Contains("cancel", StringComparison.OrdinalIgnoreCase)
      ? Visibility.Visible
      : Visibility.Collapsed;
    setupCancelButton.IsEnabled = setupCancelButton.Visibility == Visibility.Visible;

    scanSelected = true;
    UpdateScanSelection();

    if (active)
    {
      if (isScanPrompt) modalScanPanel.Focus();
      else if (isCodePrompt) codeBoxes[0].Focus();
      else if (!isEmailConfirm) setupInput.Focus();
    }
  }

  static bool IsEmailConfirmationPrompt(string message)
  {
    return message.StartsWith("Use email ", StringComparison.OrdinalIgnoreCase);
  }

  void ShowEmailInput()
  {
    setupInput.Visibility = Visibility.Visible;
    setupInput.IsEnabled = true;
    setupInput.Clear();
    promptChangeEmail.Visibility = Visibility.Collapsed;
    promptChangeEmail.IsEnabled = false;
    setupSendButton.Content = "Send";
    setupInput.Focus();
  }

  void UpdateScanSelection()
  {
    yesOption.Background = new SolidColorBrush(scanSelected ? Color.FromRgb(35, 225, 126) : Color.FromRgb(60, 70, 90));
    yesOption.BorderBrush = new SolidColorBrush(scanSelected ? Color.FromRgb(35, 225, 126) : Color.FromRgb(54, 65, 83));
    ((TextBlock)yesOption.Child).Foreground = new SolidColorBrush(scanSelected ? Colors.Black : Colors.White);
    noOption.Background = new SolidColorBrush(scanSelected ? Color.FromRgb(60, 70, 90) : Color.FromRgb(35, 225, 126));
    noOption.BorderBrush = new SolidColorBrush(scanSelected ? Color.FromRgb(54, 65, 83) : Color.FromRgb(35, 225, 126));
    ((TextBlock)noOption.Child).Foreground = new SolidColorBrush(scanSelected ? Colors.White : Colors.Black);
  }

  void RenderSetupPrompt(string prompt)
  {
    setupPromptText.Inlines.Clear();
    var urlStart = prompt.IndexOf("https://", StringComparison.OrdinalIgnoreCase);
    if (urlStart < 0)
    {
      setupPromptText.Inlines.Add(new Run(prompt));
      return;
    }

    var urlEnd = urlStart;
    while (urlEnd < prompt.Length && !char.IsWhiteSpace(prompt[urlEnd]) && prompt[urlEnd] != ',' && prompt[urlEnd] != ')')
    {
      urlEnd++;
    }

    setupPromptText.Inlines.Add(new Run(prompt[..urlStart]));
    var url = prompt[urlStart..urlEnd];
    var link = new Hyperlink(new Run(url))
    {
      NavigateUri = new Uri(url),
      Foreground = new SolidColorBrush(Color.FromRgb(77, 190, 255)),
    };
    link.RequestNavigate += (_, e) =>
    {
      OpenUri(e.Uri.AbsoluteUri);
      e.Handled = true;
    };
    setupPromptText.Inlines.Add(link);
    setupPromptText.Inlines.Add(new Run(prompt[urlEnd..]));
  }

  static void OpenUri(string uri)
  {
    Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true });
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
