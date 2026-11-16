//! Secrets on Android (#25; from writer's mobile ports at writer e89d55c): each sealed by a key in
//! Android's keystore (the bm-android plugin's cipher) and kept in a file of its own in the app's
//! storage, so none is ever in a plain file or readable off a backup without the device's key.

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use std::path::PathBuf;

/// Seals and opens bytes, base64 both ways: Android's keystore in the app, a stand-in in tests.
pub trait Cipher: Send + Sync {
    fn seal(&self, plain: String) -> Result<String, String>;
    fn open(&self, sealed: String) -> Result<String, String>;
}

/// Secrets by name, one sealed file each under `dir`.
pub struct Named<C: Cipher> {
    dir: PathBuf,
    cipher: C,
}

impl<C: Cipher + Clone> Named<C> {
    pub fn new(dir: PathBuf, cipher: C) -> Self {
        Named { dir, cipher }
    }

    /// One secret: names are the engine's own ("age-identity"), never a path.
    pub fn named(&self, name: &str) -> Result<Secrets<C>, String> {
        if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
            return Err(format!("Not a secret's name: {name:?}"));
        }
        Ok(Secrets::new(self.dir.join(name), self.cipher.clone()))
    }
}

pub struct Secrets<C: Cipher> {
    file: PathBuf,
    cipher: C,
}

impl<C: Cipher> Secrets<C> {
    pub fn new(file: PathBuf, cipher: C) -> Self {
        Secrets { file, cipher }
    }

    /// The secret, or None if there's none, or if what's kept can't be opened (the key went with a
    /// reinstall, say): then it's forgotten, and the person joins again with their passphrase.
    pub fn get(&self) -> Result<Option<String>, String> {
        let Some(sealed) = crate::files::read(&self.file.to_string_lossy()).map_err(|e| e.message)? else { return Ok(None) };
        let opened = self.cipher.open(BASE64.encode(sealed)).and_then(|b64| BASE64.decode(b64).map_err(|e| e.to_string())).and_then(|b| String::from_utf8(b).map_err(|e| e.to_string()));
        match opened {
            Ok(token) => Ok(Some(token)),
            Err(_) => {
                self.delete()?;
                Ok(None)
            }
        }
    }

    pub fn set(&self, token: &str) -> Result<(), String> {
        let sealed = BASE64.decode(self.cipher.seal(BASE64.encode(token))?).map_err(|e| e.to_string())?;
        crate::files::write(&self.file.to_string_lossy(), &sealed).map_err(|e| e.message)
    }

    pub fn delete(&self) -> Result<(), String> {
        crate::files::remove(&self.file.to_string_lossy()).map_err(|e| e.message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A stand-in for the keystore: XOR with a key byte, and a check byte so a wrong key fails to open.
    #[derive(Clone)]
    struct Xor(u8);

    impl Cipher for Xor {
        fn seal(&self, plain: String) -> Result<String, String> {
            let mut out = vec![self.0];
            out.extend(BASE64.decode(plain).unwrap().iter().map(|b| b ^ self.0));
            Ok(BASE64.encode(out))
        }
        fn open(&self, sealed: String) -> Result<String, String> {
            let bytes = BASE64.decode(sealed).unwrap();
            if bytes.first() != Some(&self.0) {
                return Err("The key that sealed this is gone.".into());
            }
            Ok(BASE64.encode(bytes[1..].iter().map(|b| b ^ self.0).collect::<Vec<_>>()))
        }
    }

    #[test]
    fn keeps_the_token_sealed_and_gives_it_back() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("secrets/github");
        let secrets = Secrets::new(file.clone(), Xor(0x5a));
        assert_eq!(secrets.get().unwrap(), None);
        secrets.set("gho_token123").unwrap();
        let kept = std::fs::read(&file).unwrap();
        assert!(!String::from_utf8_lossy(&kept).contains("gho_token123"));
        assert_eq!(secrets.get().unwrap().as_deref(), Some("gho_token123"));
        secrets.set("gho_other").unwrap();
        assert_eq!(secrets.get().unwrap().as_deref(), Some("gho_other"));
        secrets.delete().unwrap();
        secrets.delete().unwrap();
        assert_eq!(secrets.get().unwrap(), None);
    }

    #[test]
    fn keeps_named_secrets_apart_and_refuses_odd_names() {
        let dir = tempfile::tempdir().unwrap();
        let named = Named::new(dir.path().to_path_buf(), Xor(7));
        named.named("age-identity").unwrap().set("AGE-SECRET-KEY-1ABC").unwrap();
        named.named("other").unwrap().set("x").unwrap();
        assert_eq!(named.named("age-identity").unwrap().get().unwrap().as_deref(), Some("AGE-SECRET-KEY-1ABC"));
        assert!(named.named("../escape").is_err());
        assert!(named.named("").is_err());
    }

    #[test]
    fn forgets_a_token_its_key_cant_open() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("github");
        Secrets::new(file.clone(), Xor(1)).set("gho_token123").unwrap();
        let after_reinstall = Secrets::new(file.clone(), Xor(2));
        assert_eq!(after_reinstall.get().unwrap(), None);
        assert!(!file.exists());
    }
}
