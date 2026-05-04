import time
import random
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from colorama import init, Fore, Style

init(autoreset=True)

# ==================== KONFIGURASI ====================
WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyfnQDzLWXucg2hlQuNFtemNJv_2pKqitn43PPNWCO-9WaOwhBGmk9eZwSjeoUClp2M/exec"
TEST_TOKEN = "TEST002"
TEST_KELAS = "TEST"
TEST_USERNAME_BASE = "testuser"

# ==================== HELPER ====================
def log_info(msg):
    print(f"{Fore.CYAN}[INFO]{Style.RESET_ALL} {msg}")

def log_ok(msg):
    print(f"{Fore.GREEN}[OK]{Style.RESET_ALL} {msg}")

def log_warn(msg):
    print(f"{Fore.YELLOW}[WARN]{Style.RESET_ALL} {msg}")

def log_error(msg):
    print(f"{Fore.RED}[ERROR]{Style.RESET_ALL} {msg}")

# ==================== DRIVER ====================
def create_driver(headless=False):
    chrome_options = webdriver.ChromeOptions()
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option("useAutomationExtension", False)
    if headless:
        chrome_options.add_argument("--headless=new")
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return driver

# ==================== CBT TESTER ====================
class CBTTester:
    def __init__(self, driver):
        self.driver = driver
        self.wait = WebDriverWait(driver, 30)  # timeout lebih panjang

    def login(self, username, kelas, token):
        log_info(f"Login sebagai {username}...")
        self.driver.get(WEB_APP_URL)
        # Tunggu halaman selesai loading penuh (render HTML + resource eksternal)
        time.sleep(5)
        self.driver.save_screenshot("debug01_after_get.png")

        # Tunggu hingga form login terlihat
        try:
            self.wait.until(EC.visibility_of_element_located((By.ID, "in-user")))
            log_info("Form login ditemukan.")
        except:
            log_error("Form login tidak muncul, screenshot disimpan.")
            self.driver.save_screenshot("error_no_login_form.png")
            raise

        # Isi form
        self.driver.find_element(By.ID, "in-user").send_keys(username)
        self.driver.find_element(By.ID, "in-kelas").send_keys(kelas)
        self.driver.find_element(By.ID, "in-token").send_keys(token)

        # Klik tombol MULAI UJIAN
        self.driver.find_element(By.XPATH, "//button[contains(text(),'MULAI UJIAN')]").click()

        # Tunggu timer muncul (tanda ujian dimulai)
        try:
            self.wait.until(EC.visibility_of_element_located((By.ID, "timer-display")))
            log_ok("Login berhasil, tampilan ujian muncul.")
        except:
            log_error("Gagal masuk ke tampilan ujian.")
            self.driver.save_screenshot("error_after_login_click.png")
            raise

    def pilih_jawaban_acak(self):
        try:
            options = self.driver.find_elements(By.CLASS_NAME, "opt-box")
            if not options:
                log_warn("Tidak ada opsi jawaban.")
                return False
            chosen = random.choice(options)
            chosen.click()
            log_info(f"Dipilih: {chosen.text[:40]}...")
            return True
        except Exception as e:
            log_error(f"Gagal pilih jawaban: {e}")
            return False

    def next_question(self):
        try:
            btn = self.driver.find_element(By.XPATH, "//button[contains(text(),'LANJUT')]")
            btn.click()
            time.sleep(0.7)
            return True
        except:
            return False

    def jawab_semua_soal(self):
        tombol = self.driver.find_elements(By.CSS_SELECTOR, ".btn-nomor")
        total = len(tombol)
        for i in range(total):
            self.pilih_jawaban_acak()
            if i < total - 1:
                self.next_question()
                time.sleep(0.4)

    def get_pelanggaran(self):
        return self.driver.execute_script("return pelanggaran;")

    def simulasi_pindah_tab(self, durasi=5):
        log_info(f"Simulasi pindah tab {durasi} detik...")
        self.driver.execute_script("window.open('about:blank','_blank');")
        self.driver.switch_to.window(self.driver.window_handles[1])
        time.sleep(durasi)
        self.driver.switch_to.window(self.driver.window_handles[0])
        log_ok("Kembali ke ujian.")

    def test_koneksi_offline(self):
        log_info("Simulasi offline...")
        self.driver.execute_script("Object.defineProperty(navigator, 'onLine', {get: ()=> false});")
        self.driver.execute_script("window.dispatchEvent(new Event('offline'));")
        time.sleep(1.5)

        cek = self.driver.execute_script(
            "try { return localStorage.getItem('cbt_local_' + currentToken + '_' + currentUsername); } catch(e) { return null; }"
        )
        if cek:
            log_ok("Jawaban tersimpan di localStorage saat offline.")
        else:
            log_warn("LocalStorage kosong / gagal dibaca.")

        # Kembalikan online
        self.driver.execute_script("Object.defineProperty(navigator, 'onLine', {get: ()=> true});")
        self.driver.execute_script("window.dispatchEvent(new Event('online'));")
        time.sleep(1)
        log_ok("Online dipulihkan (simulasi).")

    def test_fullscreen_exit(self):
        log_info("Mencoba Escape (fullscreen exit)...")
        try:
            webdriver.ActionChains(self.driver).send_keys(u'\ue00c').perform()
            time.sleep(1)
            log_warn("Tidak ada peringatan (Escape dicegah oleh client).")
        except Exception as e:
            log_warn(f"Gagal mengirim Escape: {e}")

    def test_waktu_habis(self):
        log_info("Mengatur sisa waktu = 1 detik...")
        self.driver.execute_script("sisa = 1;")
        time.sleep(3)  # tunggu timer habis & SweetAlert tampil
        try:
            self.wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "swal2-confirm")))
            self.driver.find_element(By.CLASS_NAME, "swal2-confirm").click()
            log_ok("Submit otomatis berhasil.")
        except:
            log_error("Gagal submit otomatis.")
            self.driver.save_screenshot("error_autosubmit.png")

    def submit_manual(self):
        try:
            btn = self.driver.find_element(By.ID, "btn-selesai")
            if btn.is_enabled():
                btn.click()
                self.wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "swal2-confirm")))
                self.driver.find_element(By.CLASS_NAME, "swal2-confirm").click()
                log_ok("Submit manual berhasil.")
            else:
                log_warn("Tombol SELESAI masih terkunci.")
        except Exception as e:
            log_error(f"Gagal submit manual: {e}")

# ==================== TES LINGKUNGAN ====================
def test_environment():
    log_info("====== TEST KONEKSI LINGKUNGAN ======")
    driver = create_driver(headless=True)
    try:
        driver.get(WEB_APP_URL)
        time.sleep(5)  # tunggu render penuh
        driver.save_screenshot("env_headless.png")
        WebDriverWait(driver, 20).until(EC.presence_of_element_located((By.ID, "in-user")))
        log_ok("Form login ada.")

        driver.find_element(By.ID, "in-user").send_keys(f"{TEST_USERNAME_BASE}1")
        driver.find_element(By.ID, "in-kelas").send_keys(TEST_KELAS)
        driver.find_element(By.ID, "in-token").send_keys(TEST_TOKEN)
        driver.find_element(By.XPATH, "//button[contains(text(),'MULAI UJIAN')]").click()
        time.sleep(3)
        if "error" in driver.page_source.lower():
            log_warn("Login gagal (mungkin data tidak lengkap).")
        else:
            log_ok("Login tampaknya berhasil (tidak ada error langsung).")
    except Exception as e:
        log_error(f"Environment test gagal: {e}")
        driver.save_screenshot("env_error.png")
    finally:
        driver.quit()

# ==================== TES KEAMANAN ====================
def run_security_test():
    log_info("====== SECURITY TEST ======")
    driver = create_driver(headless=False)  # False agar bisa dilihat
    tester = CBTTester(driver)

    try:
        tester.login(f"{TEST_USERNAME_BASE}1", TEST_KELAS, TEST_TOKEN)

        # Jawab 3 soal
        log_info("Menjawab 3 soal...")
        for _ in range(3):
            tester.pilih_jawaban_acak()
            tester.next_question()
            time.sleep(0.5)

        awal = tester.get_pelanggaran()
        log_info(f"Pelanggaran awal: {awal}")

        tester.simulasi_pindah_tab(durasi=5)
        pel = tester.get_pelanggaran()
        if pel > awal:
            log_ok(f"Pelanggaran bertambah ➜ {pel}")
        else:
            log_warn("Pelanggaran tidak bertambah.")

        tester.test_koneksi_offline()
        tester.test_fullscreen_exit()
        tester.test_waktu_habis()

        log_ok("Security test selesai.")
    except Exception as e:
        log_error(f"Test gagal: {e}")
        driver.save_screenshot("security_error.png")
        import traceback
        traceback.print_exc()
    finally:
        time.sleep(2)
        driver.quit()

# ==================== MAIN ====================
if __name__ == "__main__":
    print()
    print(Fore.MAGENTA + "========================================")
    print(Fore.MAGENTA + "   CBT Security & Environment Tester")
    print(Fore.MAGENTA + "========================================")
    print()
    test_environment()
    print()
    run_security_test()