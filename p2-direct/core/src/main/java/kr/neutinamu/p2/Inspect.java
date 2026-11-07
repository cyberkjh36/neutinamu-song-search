package kr.neutinamu.p2;

import java.io.*;
/** Local-only importer verification. Never prints identifiers, registration bytes or IPs. */
public final class Inspect {
    public static void main(String[] args)throws Exception {
        if(args.length!=1)throw new IllegalArgumentException("Pass one local PCAP path");
        try(InputStream in=new FileInputStream(args[0])){
            CaptureProfile p=CaptureProfile.read(in);
            if(p.registration().length!=63)throw new IOException("Unexpected registration size");
            System.out.println("PASS: P2 registration and device identity imported; private fields not displayed.");
        }
    }
}
