# Wise Design Learning Systems - garde-clavier du mode kiosque (aucun droit administrateur requis).
# Bloque : touches Windows, Alt+Tab, Alt+Echap, Ctrl+Echap (menu Demarrer) ; masque la barre des taches.
# Se ferme quand l'application se termine (ou quand son entree standard est fermee) et restaure alors la barre des taches.
param([int]$ParentPid = 0)
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
public class WlsKeyGuard {
  delegate IntPtr Proc(int n, IntPtr w, IntPtr l);
  static Proc proc = HookCb;
  static IntPtr hook = IntPtr.Zero;
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Proc p, IntPtr m, uint t);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int n, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int k);
  [DllImport("user32.dll")] static extern IntPtr FindWindow(string c, string n);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string n);
  static IntPtr HookCb(int n, IntPtr w, IntPtr l) {
    if (n >= 0) {
      int vk = Marshal.ReadInt32(l);
      int flags = Marshal.ReadInt32(l, 8);
      bool alt = (flags & 0x20) != 0;
      bool ctrl = (GetAsyncKeyState(0x11) & 0x8000) != 0;
      if (vk == 0x5B || vk == 0x5C) return (IntPtr)1;      // touches Windows
      if (alt && (vk == 0x09 || vk == 0x1B)) return (IntPtr)1; // Alt+Tab, Alt+Echap
      if (ctrl && vk == 0x1B) return (IntPtr)1;               // Ctrl+Echap
    }
    return CallNextHookEx(hook, n, w, l);
  }
  static void Tray(int cmd) {
    IntPtr t = FindWindow("Shell_TrayWnd", null);
    if (t != IntPtr.Zero) ShowWindow(t, cmd);
    IntPtr s = FindWindow("Shell_SecondaryTrayWnd", null);
    if (s != IntPtr.Zero) ShowWindow(s, cmd);
  }
  public static void Run(int pid) {
    hook = SetWindowsHookEx(13, proc, GetModuleHandle(null), 0);
    System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    timer.Interval = 1500;
    timer.Tick += delegate {
      Tray(0);
      if (pid > 0) { try { Process.GetProcessById(pid); } catch { Application.Exit(); } }
    };
    timer.Start();
    Thread reader = new Thread(delegate () { try { while (Console.In.ReadLine() != null) { } } catch { } Application.Exit(); });
    reader.IsBackground = true;
    reader.Start();
    Application.Run();
    Tray(5);
  }
}
"@
[WlsKeyGuard]::Run($ParentPid)
