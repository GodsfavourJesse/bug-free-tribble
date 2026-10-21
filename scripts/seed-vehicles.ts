import {
    and,
    eq,
} from "drizzle-orm";

import { db } from "../src/database/index.ts";

import {
    vehicleMakes,
    vehicleModels,
} from "../src/database/schema/index.ts";

/**
 * TYPES
 */

type ModelSeed = {
    name: string;
    aliases?: string[];
    nigeriaMarket?: boolean;
};

type MakeSeed = {
    name: string;
    aliases?: string[];
    nigeriaMarket?: boolean;
    models: ModelSeed[];
};

/**
 * VEHICLE CATALOG
 *
 * This catalog covers common Nigerian-market vehicles,
 * international manufacturers, luxury vehicles, and exotics.
 *
 * The catalog's presence does not mean every model is
 * officially sold in Nigeria.
 */

const catalog: MakeSeed[] = [
    {
        name: "Acura",
        aliases: ["Acura"],
        models: [
            { name: "ILX" },
            { name: "Integra" },
            { name: "TL" },
            { name: "TLX" },
            { name: "TSX" },
            { name: "RL" },
            { name: "RLX" },
            { name: "RDX" },
            { name: "MDX" },
            { name: "ZDX" },
            { name: "NSX" },
        ],
    },
    {
        name: "Alfa Romeo",
        aliases: ["Alfa Romeo", "Alfa"],
        models: [
            { name: "Giulia" },
            { name: "Stelvio" },
            { name: "Tonale" },
            { name: "4C" },
            { name: "8C Competizione" },
            { name: "159" },
            { name: "Brera" },
            { name: "Giulietta" },
        ],
    },
    {
        name: "Aston Martin",
        aliases: ["Aston Martin"],
        models: [
            { name: "DB7" },
            { name: "DB9" },
            { name: "DB11" },
            { name: "DB12" },
            { name: "DBS" },
            { name: "DBS Superleggera" },
            { name: "Vantage" },
            { name: "Vanquish" },
            { name: "Rapide" },
            { name: "Rapide S" },
            { name: "DBX" },
            { name: "DBX707" },
            { name: "Valkyrie" },
            { name: "Valhalla" },
        ],
    },
    {
        name: "Audi",
        aliases: ["Audi"],
        models: [
            { name: "A1" },
            { name: "A3" },
            { name: "A4" },
            { name: "A5" },
            { name: "A6" },
            { name: "A7" },
            { name: "A8" },
            { name: "Q2" },
            { name: "Q3" },
            { name: "Q5" },
            { name: "Q7" },
            { name: "Q8" },
            { name: "Q4 e-tron" },
            { name: "Q6 e-tron" },
            { name: "e-tron GT" },
            { name: "TT" },
            { name: "R8" },
            { name: "RS3" },
            { name: "RS5" },
            { name: "RS6" },
            { name: "RS7" },
        ],
    },
    {
        name: "Bentley",
        aliases: ["Bentley"],
        models: [
            { name: "Continental GT" },
            { name: "Continental GTC" },
            { name: "Flying Spur" },
            { name: "Bentayga" },
            { name: "Mulsanne" },
            { name: "Arnage" },
            { name: "Azure" },
            { name: "Brooklands" },
            { name: "Turbo R" },
        ],
    },
    {
        name: "BMW",
        aliases: ["BMW", "Bayerische Motoren Werke"],
        models: [
            { name: "1 Series" },
            { name: "2 Series" },
            { name: "3 Series" },
            { name: "4 Series" },
            { name: "5 Series" },
            { name: "6 Series" },
            { name: "7 Series" },
            { name: "8 Series" },
            { name: "X1" },
            { name: "X2" },
            { name: "X3" },
            { name: "X4" },
            { name: "X5" },
            { name: "X6" },
            { name: "X7" },
            { name: "XM" },
            { name: "Z3" },
            { name: "Z4" },
            { name: "i3" },
            { name: "i4" },
            { name: "i5" },
            { name: "i7" },
            { name: "iX" },
            { name: "M2" },
            { name: "M3" },
            { name: "M4" },
            { name: "M5" },
            { name: "M8" },
        ],
    },
    {
        name: "Brabus",
        aliases: ["Brabus"],
        models: [
            { name: "G-Class" },
            { name: "Rocket" },
            { name: "Brabus 900" },
            { name: "Brabus 800" },
            { name: "Brabus 700" },
        ],
    },
    {
        name: "Bugatti",
        aliases: ["Bugatti"],
        nigeriaMarket: false,
        models: [
            { name: "Veyron" },
            { name: "Chiron" },
            { name: "Chiron Super Sport" },
            { name: "Divo" },
            { name: "Centodieci" },
            { name: "Bolide" },
            { name: "Mistral" },
            { name: "Tourbillon" },
            { name: "EB110" },
            { name: "Type 57" },
        ],
    },
    {
        name: "BYD",
        aliases: ["BYD", "Build Your Dreams"],
        models: [
            { name: "Atto 3" },
            { name: "Dolphin" },
            { name: "Seal" },
            { name: "Han" },
            { name: "Tang" },
            { name: "Song" },
            { name: "Qin" },
            { name: "Seagull" },
            { name: "Shark" },
        ],
    },
    {
        name: "Chery",
        aliases: ["Chery"],
        models: [
            { name: "Tiggo 2" },
            { name: "Tiggo 4" },
            { name: "Tiggo 7" },
            { name: "Tiggo 8" },
            { name: "Tiggo 9" },
            { name: "Arrizo 5" },
            { name: "Arrizo 8" },
        ],
    },
    {
        name: "Chevrolet",
        aliases: ["Chevrolet", "Chevy"],
        models: [
            { name: "Aveo" },
            { name: "Cruze" },
            { name: "Malibu" },
            { name: "Impala" },
            { name: "Camaro" },
            { name: "Corvette" },
            { name: "Spark" },
            { name: "Equinox" },
            { name: "Blazer" },
            { name: "Traverse" },
            { name: "Tahoe" },
            { name: "Suburban" },
            { name: "Trailblazer" },
            { name: "Colorado" },
            { name: "Silverado" },
        ],
    },
    {
        name: "Chrysler",
        aliases: ["Chrysler"],
        models: [
            { name: "300" },
            { name: "200" },
            { name: "Pacifica" },
            { name: "Voyager" },
            { name: "PT Cruiser" },
        ],
    },
    {
        name: "Czinger",
        aliases: ["Czinger"],
        nigeriaMarket: false,
        models: [
            { name: "21C" },
        ],
    },
    {
        name: "Daewoo",
        aliases: ["Daewoo"],
        models: [
            { name: "Matiz" },
            { name: "Lanos" },
            { name: "Leganza" },
            { name: "Nubira" },
        ],
    },
    {
        name: "Daihatsu",
        aliases: ["Daihatsu"],
        models: [
            { name: "Terios" },
            { name: "Sirion" },
            { name: "Mira" },
            { name: "Move" },
            { name: "Rocky" },
        ],
    },
    {
        name: "De Tomaso",
        aliases: ["De Tomaso"],
        nigeriaMarket: false,
        models: [
            { name: "Pantera" },
            { name: "Mangusta" },
            { name: "P72" },
        ],
    },
    {
        name: "Dodge",
        aliases: ["Dodge"],
        models: [
            { name: "Challenger" },
            { name: "Charger" },
            { name: "Durango" },
            { name: "Journey" },
            { name: "Nitro" },
            { name: "Dart" },
            { name: "Viper" },
            { name: "Ram" },
        ],
    },
    {
        name: "Ferrari",
        aliases: ["Ferrari"],
        nigeriaMarket: false,
        models: [
            { name: "296 GTB" },
            { name: "296 GTS" },
            { name: "458 Italia" },
            { name: "458 Spider" },
            { name: "488 GTB" },
            { name: "488 Spider" },
            { name: "F8 Tributo" },
            { name: "F8 Spider" },
            { name: "812 Superfast" },
            { name: "812 GTS" },
            { name: "12Cilindri" },
            { name: "California" },
            { name: "California T" },
            { name: "Portofino" },
            { name: "Portofino M" },
            { name: "Roma" },
            { name: "Roma Spider" },
            { name: "Purosangue" },
            { name: "LaFerrari" },
            { name: "Enzo" },
            { name: "F40" },
            { name: "F50" },
            { name: "Testarossa" },
            { name: "SF90 Stradale" },
            { name: "SF90 Spider" },
        ],
    },
    {
        name: "Fiat",
        aliases: ["Fiat"],
        models: [
            { name: "500" },
            { name: "500X" },
            { name: "Panda" },
            { name: "Punto" },
            { name: "Tipo" },
            { name: "Doblo" },
        ],
    },
    {
        name: "Ford",
        aliases: ["Ford"],
        models: [
            { name: "Fiesta" },
            { name: "Focus" },
            { name: "Fusion" },
            { name: "Mondeo" },
            { name: "Mustang" },
            { name: "Taurus" },
            { name: "Escape" },
            { name: "Edge" },
            { name: "Explorer" },
            { name: "Expedition" },
            { name: "EcoSport" },
            { name: "Bronco" },
            { name: "Ranger" },
            { name: "Everest" },
            { name: "F-150" },
            { name: "F-250" },
            { name: "F-350" },
            { name: "Transit" },
        ],
    },
    {
        name: "Genesis",
        aliases: ["Genesis"],
        models: [
            { name: "G70" },
            { name: "G80" },
            { name: "G90" },
            { name: "GV60" },
            { name: "GV70" },
            { name: "GV80" },
            { name: "Electrified G80" },
        ],
    },
    {
        name: "Geely",
        aliases: ["Geely"],
        models: [
            { name: "Coolray" },
            { name: "Monjaro" },
            { name: "Emgrand" },
            { name: "Azkarra" },
            { name: "Okavango" },
            { name: "Geometry C" },
        ],
    },
    {
        name: "GMC",
        aliases: ["GMC"],
        models: [
            { name: "Terrain" },
            { name: "Acadia" },
            { name: "Yukon" },
            { name: "Yukon XL" },
            { name: "Canyon" },
            { name: "Sierra 1500" },
            { name: "Sierra 2500HD" },
            { name: "Sierra 3500HD" },
            { name: "Hummer EV" },
        ],
    },
    {
        name: "Great Wall",
        aliases: ["Great Wall", "GWM"],
        models: [
            { name: "Wingle" },
            { name: "Poer" },
            { name: "Cannon" },
            { name: "Haval H6" },
        ],
    },
    {
        name: "Haval",
        aliases: ["Haval", "Great Wall Haval"],
        models: [
            { name: "H2" },
            { name: "H6" },
            { name: "H6 GT" },
            { name: "H9" },
            { name: "Jolion" },
            { name: "Dargo" },
        ],
    },
    {
        name: "Hennessey",
        aliases: ["Hennessey"],
        nigeriaMarket: false,
        models: [
            { name: "Venom F5" },
            { name: "Venom GT" },
            { name: "VelociRaptor" },
            { name: "Mammoth" },
        ],
    },
    {
        name: "Honda",
        aliases: ["Honda"],
        models: [
            { name: "Accord" },
            { name: "Civic" },
            { name: "City" },
            { name: "CR-V" },
            { name: "HR-V" },
            { name: "BR-V" },
            { name: "Pilot" },
            { name: "Odyssey" },
            { name: "Ridgeline" },
            { name: "Fit" },
            { name: "Jazz" },
            { name: "Insight" },
            { name: "Passport" },
            { name: "Element" },
            { name: "Legend" },
        ],
    },
    {
        name: "Hyundai",
        aliases: ["Hyundai"],
        models: [
            { name: "Accent" },
            { name: "Elantra" },
            { name: "Sonata" },
            { name: "Grandeur" },
            { name: "Azera" },
            { name: "i10" },
            { name: "i20" },
            { name: "i30" },
            { name: "Tucson" },
            { name: "Santa Fe" },
            { name: "Palisade" },
            { name: "Kona" },
            { name: "Venue" },
            { name: "Creta" },
            { name: "Ioniq 5" },
            { name: "Ioniq 6" },
            { name: "Staria" },
            { name: "H-1" },
        ],
    },
    {
        name: "Infiniti",
        aliases: ["Infiniti"],
        models: [
            { name: "Q30" },
            { name: "Q50" },
            { name: "Q60" },
            { name: "Q70" },
            { name: "QX30" },
            { name: "QX50" },
            { name: "QX55" },
            { name: "QX60" },
            { name: "QX70" },
            { name: "QX80" },
            { name: "FX35" },
            { name: "FX45" },
            { name: "FX50" },
            { name: "G35" },
            { name: "G37" },
        ],
    },
    {
        name: "Isuzu",
        aliases: ["Isuzu"],
        models: [
            { name: "D-Max" },
            { name: "MU-X" },
            { name: "Trooper" },
            { name: "Rodeo" },
            { name: "Ascender" },
            { name: "Elf" },
            { name: "N-Series" },
            { name: "F-Series" },
        ],
    },
    {
        name: "Jaguar",
        aliases: ["Jaguar"],
        models: [
            { name: "XE" },
            { name: "XF" },
            { name: "XJ" },
            { name: "XK" },
            { name: "F-Type" },
            { name: "E-Pace" },
            { name: "F-Pace" },
            { name: "I-Pace" },
            { name: "S-Type" },
            { name: "X-Type" },
        ],
    },
    {
        name: "Jeep",
        aliases: ["Jeep"],
        models: [
            { name: "Wrangler" },
            { name: "Grand Cherokee" },
            { name: "Cherokee" },
            { name: "Compass" },
            { name: "Renegade" },
            { name: "Gladiator" },
            { name: "Commander" },
            { name: "Patriot" },
            { name: "Liberty" },
            { name: "Wagoneer" },
            { name: "Grand Wagoneer" },
        ],
    },
    {
        name: "Kia",
        aliases: ["Kia"],
        models: [
            { name: "Picanto" },
            { name: "Rio" },
            { name: "Cerato" },
            { name: "Forte" },
            { name: "Optima" },
            { name: "K5" },
            { name: "Cadenza" },
            { name: "K8" },
            { name: "K9" },
            { name: "Soul" },
            { name: "Seltos" },
            { name: "Sportage" },
            { name: "Sorento" },
            { name: "Telluride" },
            { name: "Carens" },
            { name: "Carnival" },
            { name: "EV3" },
            { name: "EV6" },
            { name: "EV9" },
        ],
    },
    {
        name: "Koenigsegg",
        aliases: ["Koenigsegg"],
        nigeriaMarket: false,
        models: [
            { name: "CC8S" },
            { name: "CCR" },
            { name: "CCX" },
            { name: "Agera" },
            { name: "Agera R" },
            { name: "Agera RS" },
            { name: "One:1" },
            { name: "Regera" },
            { name: "Jesko" },
            { name: "Jesko Absolut" },
            { name: "Gemera" },
            { name: "CC850" },
        ],
    },
    {
        name: "Lamborghini",
        aliases: ["Lamborghini", "Lambo"],
        nigeriaMarket: false,
        models: [
            { name: "Aventador" },
            { name: "Aventador SVJ" },
            { name: "Huracan" },
            { name: "Huracan EVO" },
            { name: "Huracan STO" },
            { name: "Revuelto" },
            { name: "Urus" },
            { name: "Urus S" },
            { name: "Urus Performante" },
            { name: "Urus SE" },
            { name: "Gallardo" },
            { name: "Murcielago" },
            { name: "Diablo" },
            { name: "Countach" },
            { name: "Sian" },
            { name: "Centenario" },
            { name: "Veneno" },
        ],
    },
    {
        name: "Land Rover",
        aliases: ["Land Rover", "Range Rover"],
        models: [
            { name: "Defender" },
            { name: "Discovery" },
            { name: "Discovery Sport" },
            { name: "Freelander" },
            { name: "Range Rover" },
            { name: "Range Rover Sport" },
            { name: "Range Rover Velar" },
            { name: "Range Rover Evoque" },
            { name: "Range Rover SV" },
        ],
    },
    {
        name: "Lexus",
        aliases: ["Lexus"],
        models: [
            { name: "IS" },
            { name: "ES" },
            { name: "GS" },
            { name: "LS" },
            { name: "LC" },
            { name: "RC" },
            { name: "UX" },
            { name: "NX" },
            { name: "RX" },
            { name: "GX" },
            { name: "LX" },
            { name: "RZ" },
            { name: "CT" },
            { name: "LFA" },
        ],
    },
    {
        name: "Lincoln",
        aliases: ["Lincoln"],
        models: [
            { name: "Navigator" },
            { name: "Aviator" },
            { name: "Nautilus" },
            { name: "Corsair" },
            { name: "Continental" },
            { name: "MKZ" },
            { name: "MKX" },
            { name: "MKS" },
        ],
    },
    {
        name: "Lotus",
        aliases: ["Lotus"],
        nigeriaMarket: false,
        models: [
            { name: "Elise" },
            { name: "Exige" },
            { name: "Evora" },
            { name: "Emira" },
            { name: "Emeya" },
            { name: "Eletre" },
            { name: "Esprit" },
            { name: "Europa" },
        ],
    },
    {
        name: "Lucid",
        aliases: ["Lucid"],
        nigeriaMarket: false,
        models: [
            { name: "Air" },
            { name: "Gravity" },
        ],
    },
    {
        name: "Mahindra",
        aliases: ["Mahindra"],
        models: [
            { name: "Scorpio" },
            { name: "XUV500" },
            { name: "XUV700" },
            { name: "Thar" },
            { name: "Bolero" },
            { name: "Pik Up" },
            { name: "XUV300" },
        ],
    },
    {
        name: "Maserati",
        aliases: ["Maserati"],
        nigeriaMarket: false,
        models: [
            { name: "Ghibli" },
            { name: "Quattroporte" },
            { name: "Levante" },
            { name: "Grecale" },
            { name: "GranTurismo" },
            { name: "GranCabrio" },
            { name: "MC20" },
            { name: "MC20 Cielo" },
            { name: "MC12" },
            { name: "3200 GT" },
            { name: "4200 GT" },
            { name: "Spyder" },
        ],
    },
    {
        name: "Maybach",
        aliases: ["Mercedes-Maybach", "Mercedes Maybach"],
        models: [
            { name: "S-Class" },
            { name: "GLS" },
            { name: "57" },
            { name: "57 S" },
            { name: "62" },
            { name: "62 S" },
            { name: "Exelero" },
        ],
    },
    {
        name: "Mazda",
        aliases: ["Mazda"],
        models: [
            { name: "Mazda2" },
            { name: "Mazda3" },
            { name: "Mazda6" },
            { name: "CX-3" },
            { name: "CX-30" },
            { name: "CX-5" },
            { name: "CX-50" },
            { name: "CX-60" },
            { name: "CX-70" },
            { name: "CX-80" },
            { name: "CX-9" },
            { name: "CX-90" },
            { name: "MX-5" },
            { name: "RX-7" },
            { name: "RX-8" },
            { name: "BT-50" },
        ],
    },
    {
        name: "McLaren",
        aliases: ["McLaren"],
        nigeriaMarket: false,
        models: [
            { name: "540C" },
            { name: "570S" },
            { name: "570GT" },
            { name: "600LT" },
            { name: "620R" },
            { name: "650S" },
            { name: "675LT" },
            { name: "720S" },
            { name: "750S" },
            { name: "765LT" },
            { name: "Artura" },
            { name: "GT" },
            { name: "GTS" },
            { name: "P1" },
            { name: "Senna" },
            { name: "Speedtail" },
            { name: "Elva" },
            { name: "W1" },
        ],
    },
    {
        name: "Mercedes-Benz",
        aliases: ["Mercedes", "Mercedes Benz", "Benz"],
        models: [
            { name: "A-Class" },
            { name: "B-Class" },
            { name: "C-Class" },
            { name: "CLA" },
            { name: "CLS" },
            { name: "E-Class" },
            { name: "EQA" },
            { name: "EQB" },
            { name: "EQE" },
            { name: "EQS" },
            { name: "G-Class" },
            { name: "GLA" },
            { name: "GLB" },
            { name: "GLC" },
            { name: "GLE" },
            { name: "GLK" },
            { name: "GLS" },
            { name: "M-Class" },
            { name: "R-Class" },
            { name: "S-Class" },
            { name: "SL" },
            { name: "SLC" },
            { name: "SLK" },
            { name: "V-Class" },
            { name: "Vito" },
            { name: "Sprinter" },
            { name: "AMG GT" },
            { name: "AMG GT 4-Door" },
        ],
    },
    {
        name: "MG",
        aliases: ["MG Motor", "Morris Garages"],
        models: [
            { name: "MG3" },
            { name: "MG4" },
            { name: "MG5" },
            { name: "MG6" },
            { name: "ZS" },
            { name: "HS" },
            { name: "RX5" },
            { name: "RX8" },
            { name: "Cyberster" },
        ],
    },
    {
        name: "MINI",
        aliases: ["Mini Cooper", "MINI"],
        models: [
            { name: "Cooper" },
            { name: "Clubman" },
            { name: "Countryman" },
            { name: "Paceman" },
            { name: "Convertible" },
            { name: "Coupe" },
            { name: "Roadster" },
            { name: "Aceman" },
        ],
    },
    {
        name: "Mitsubishi",
        aliases: ["Mitsubishi"],
        models: [
            { name: "Lancer" },
            { name: "Outlander" },
            { name: "Pajero" },
            { name: "Montero" },
            { name: "ASX" },
            { name: "Eclipse Cross" },
            { name: "Eclipse" },
            { name: "Galant" },
            { name: "Mirage" },
            { name: "L200" },
            { name: "Triton" },
            { name: "RVR" },
            { name: "Xpander" },
        ],
    },
    {
        name: "Morgan",
        aliases: ["Morgan Motor Company"],
        nigeriaMarket: false,
        models: [
            { name: "Plus Four" },
            { name: "Plus Six" },
            { name: "Super 3" },
            { name: "Aero 8" },
        ],
    },
    {
        name: "Nissan",
        aliases: ["Nissan"],
        models: [
            { name: "Almera" },
            { name: "Altima" },
            { name: "Maxima" },
            { name: "Sentra" },
            { name: "Sunny" },
            { name: "Versa" },
            { name: "Micra" },
            { name: "Juke" },
            { name: "Kicks" },
            { name: "Qashqai" },
            { name: "X-Trail" },
            { name: "Pathfinder" },
            { name: "Murano" },
            { name: "Patrol" },
            { name: "Armada" },
            { name: "Rogue" },
            { name: "Terra" },
            { name: "Navara" },
            { name: "Frontier" },
            { name: "Titan" },
            { name: "370Z" },
            { name: "350Z" },
            { name: "GT-R" },
            { name: "Leaf" },
            { name: "Ariya" },
        ],
    },
    {
        name: "Opel",
        aliases: ["Opel"],
        models: [
            { name: "Corsa" },
            { name: "Astra" },
            { name: "Insignia" },
            { name: "Vectra" },
            { name: "Zafira" },
            { name: "Mokka" },
            { name: "Grandland" },
            { name: "Crossland" },
        ],
    },
    {
        name: "Pagani",
        aliases: ["Pagani"],
        nigeriaMarket: false,
        models: [
            { name: "Zonda" },
            { name: "Zonda F" },
            { name: "Zonda Cinque" },
            { name: "Huayra" },
            { name: "Huayra Roadster" },
            { name: "Huayra BC" },
            { name: "Utopia" },
        ],
    },
    {
        name: "Peugeot",
        aliases: ["Peugeot"],
        models: [
            { name: "206" },
            { name: "207" },
            { name: "208" },
            { name: "301" },
            { name: "307" },
            { name: "308" },
            { name: "407" },
            { name: "408" },
            { name: "508" },
            { name: "2008" },
            { name: "3008" },
            { name: "5008" },
            { name: "Partner" },
            { name: "Expert" },
            { name: "Landtrek" },
        ],
    },
    {
        name: "Pininfarina",
        aliases: ["Automobili Pininfarina"],
        nigeriaMarket: false,
        models: [
            { name: "Battista" },
            { name: "B95" },
        ],
    },
    {
        name: "Polestar",
        aliases: ["Polestar"],
        nigeriaMarket: false,
        models: [
            { name: "Polestar 1" },
            { name: "Polestar 2" },
            { name: "Polestar 3" },
            { name: "Polestar 4" },
        ],
    },
    {
        name: "Porsche",
        aliases: ["Porsche"],
        models: [
            { name: "911" },
            { name: "718 Boxster" },
            { name: "718 Cayman" },
            { name: "Panamera" },
            { name: "Cayenne" },
            { name: "Macan" },
            { name: "Taycan" },
            { name: "Carrera GT" },
            { name: "918 Spyder" },
        ],
    },
    {
        name: "Proton",
        aliases: ["Proton"],
        models: [
            { name: "Saga" },
            { name: "Persona" },
            { name: "Iriz" },
            { name: "X50" },
            { name: "X70" },
            { name: "X90" },
        ],
    },
    {
        name: "Renault",
        aliases: ["Renault"],
        models: [
            { name: "Clio" },
            { name: "Megane" },
            { name: "Fluence" },
            { name: "Logan" },
            { name: "Sandero" },
            { name: "Duster" },
            { name: "Koleos" },
            { name: "Captur" },
            { name: "Kadjar" },
            { name: "Kwid" },
            { name: "Talisman" },
            { name: "Kangoo" },
            { name: "Trafic" },
            { name: "Master" },
        ],
    },
    {
        name: "Rimac",
        aliases: ["Rimac Automobili"],
        nigeriaMarket: false,
        models: [
            { name: "Nevera" },
            { name: "Nevera R" },
            { name: "Concept One" },
        ],
    },
    {
        name: "Rolls-Royce",
        aliases: ["Rolls Royce", "Rolls-Royce Motor Cars"],
        nigeriaMarket: false,
        models: [
            { name: "Phantom" },
            { name: "Phantom Extended" },
            { name: "Ghost" },
            { name: "Ghost Extended" },
            { name: "Wraith" },
            { name: "Dawn" },
            { name: "Cullinan" },
            { name: "Spectre" },
            { name: "Silver Shadow" },
            { name: "Silver Spirit" },
            { name: "Silver Seraph" },
            { name: "Park Ward" },
        ],
    },
    {
        name: "Saab",
        aliases: ["Saab"],
        models: [
            { name: "9-3" },
            { name: "9-5" },
            { name: "900" },
            { name: "9000" },
        ],
    },
    {
        name: "Seat",
        aliases: ["SEAT"],
        models: [
            { name: "Ibiza" },
            { name: "Leon" },
            { name: "Arona" },
            { name: "Ateca" },
            { name: "Tarraco" },
        ],
    },
    {
        name: "Skoda",
        aliases: ["Škoda"],
        models: [
            { name: "Fabia" },
            { name: "Octavia" },
            { name: "Superb" },
            { name: "Karoq" },
            { name: "Kodiaq" },
            { name: "Kamiq" },
            { name: "Enyaq" },
        ],
    },
    {
        name: "Smart",
        aliases: ["smart"],
        models: [
            { name: "Fortwo" },
            { name: "Forfour" },
            { name: "#1" },
            { name: "#3" },
        ],
    },
    {
        name: "Subaru",
        aliases: ["Subaru"],
        models: [
            { name: "Impreza" },
            { name: "Legacy" },
            { name: "Outback" },
            { name: "Forester" },
            { name: "Crosstrek" },
            { name: "XV" },
            { name: "WRX" },
            { name: "BRZ" },
            { name: "Ascent" },
            { name: "Tribeca" },
        ],
    },
    {
        name: "Suzuki",
        aliases: ["Suzuki"],
        models: [
            { name: "Alto" },
            { name: "Swift" },
            { name: "Baleno" },
            { name: "Ciaz" },
            { name: "Dzire" },
            { name: "Vitara" },
            { name: "Grand Vitara" },
            { name: "Jimny" },
            { name: "S-Cross" },
            { name: "Ertiga" },
            { name: "XL7" },
            { name: "Ignis" },
            { name: "Wagon R" },
        ],
    },
    {
        name: "Tesla",
        aliases: ["Tesla"],
        models: [
            { name: "Model S" },
            { name: "Model 3" },
            { name: "Model X" },
            { name: "Model Y" },
            { name: "Cybertruck" },
            { name: "Roadster" },
        ],
    },
    {
        name: "Toyota",
        aliases: ["Toyota"],
        models: [
            { name: "4Runner" },
            { name: "Avalon" },
            { name: "Avensis" },
            { name: "Aygo" },
            { name: "Camry" },
            { name: "Carina" },
            { name: "Celica" },
            { name: "C-HR" },
            { name: "Corolla" },
            { name: "Corolla Cross" },
            { name: "Crown" },
            { name: "FJ Cruiser" },
            { name: "Fortuner" },
            { name: "Highlander" },
            { name: "Hilux" },
            { name: "Land Cruiser" },
            { name: "Land Cruiser Prado" },
            { name: "Matrix" },
            { name: "Paseo" },
            { name: "Previa" },
            { name: "Prius" },
            { name: "RAV4" },
            { name: "Sequoia" },
            { name: "Sienna" },
            { name: "Starlet" },
            { name: "Supra" },
            { name: "Tacoma" },
            { name: "Tundra" },
            { name: "Venza" },
            { name: "Verso" },
            { name: "Yaris" },
            { name: "Yaris Cross" },
            { name: "Urban Cruiser" },
            { name: "HiAce" },
            { name: "Dyna" },
        ],
    },
    {
        name: "Volkswagen",
        aliases: ["Volkswagen", "VW"],
        models: [
            { name: "Golf" },
            { name: "Jetta" },
            { name: "Passat" },
            { name: "Polo" },
            { name: "Arteon" },
            { name: "Beetle" },
            { name: "Tiguan" },
            { name: "Touareg" },
            { name: "T-Cross" },
            { name: "T-Roc" },
            { name: "Atlas" },
            { name: "Teramont" },
            { name: "ID.3" },
            { name: "ID.4" },
            { name: "ID.5" },
            { name: "ID.6" },
            { name: "ID.7" },
            { name: "Amarok" },
            { name: "Caddy" },
            { name: "Transporter" },
            { name: "Caravelle" },
        ],
    },
    {
        name: "Volvo",
        aliases: ["Volvo"],
        models: [
            { name: "S40" },
            { name: "S60" },
            { name: "S80" },
            { name: "S90" },
            { name: "V40" },
            { name: "V60" },
            { name: "V90" },
            { name: "XC40" },
            { name: "XC60" },
            { name: "XC70" },
            { name: "XC90" },
            { name: "EX30" },
            { name: "EX40" },
            { name: "EX90" },
        ],
    },
];

/**
 * SLUG GENERATOR
 *
 * Produces URL-friendly identifiers:
 * "Mercedes-Benz" -> "mercedes-benz"
 * "296 GTB"       -> "296-gtb"
 */
function slugify(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * SEED CATALOG
 *
 * Safe to rerun:
 * - Existing makes are updated with missing aliases.
 * - Existing models are detected using makeId + name.
 * - Duplicate records are not inserted.
 */
async function seedCatalog(): Promise<void> {
    let makesCreated = 0;
    let makesExisting = 0;

    let modelsCreated = 0;
    let modelsExisting = 0;

    console.log("Starting KARMASS vehicle catalog seed...\n");

    for (const makeSeed of catalog) {
        const makeSlug = slugify(makeSeed.name);

        let make = await db.query.vehicleMakes.findFirst({
            where: eq(
                vehicleMakes.slug,
                makeSlug,
            ),
        });

        if (!make) {
            const [createdMake] = await db
                .insert(vehicleMakes)
                .values({
                    name: makeSeed.name,
                    slug: makeSlug,
                    aliases: makeSeed.aliases ?? [],
                    nigeriaMarket: makeSeed.nigeriaMarket ?? true,
                    active: true,
                })
                .returning();

            if (!createdMake) {
                throw new Error(
                    `Failed to create vehicle make: ${makeSeed.name}`,
                );
            }

            make = createdMake;
            makesCreated += 1;

            console.log(`+ Make created: ${makeSeed.name}`);
        } else {
            makesExisting += 1;

            /*
             * Keep the existing database ID and canonical name.
             * Merge aliases without introducing duplicates.
             */
            const mergedAliases = Array.from(
                new Set([
                    ...(make.aliases ?? []),
                    ...(makeSeed.aliases ?? []),
                ]),
            );

            await db
                .update(vehicleMakes)
                .set({
                    aliases: mergedAliases,
                    updatedAt: new Date(),
                })
                .where(
                    eq(
                        vehicleMakes.id,
                        make.id,
                    ),
                );
        }

        for (const modelSeed of makeSeed.models) {
            const modelSlug = slugify(modelSeed.name);

            const existingModel =
                await db.query.vehicleModels.findFirst({
                    where: and(
                        eq(
                            vehicleModels.makeId,
                            make.id,
                        ),
                        eq(
                            vehicleModels.name,
                            modelSeed.name,
                        ),
                    ),
                });

            if (existingModel) {
                modelsExisting += 1;

                const mergedAliases = Array.from(
                    new Set([
                        ...(existingModel.aliases ?? []),
                        ...(modelSeed.aliases ?? []),
                    ]),
                );

                await db
                    .update(vehicleModels)
                    .set({
                        aliases: mergedAliases,
                        updatedAt: new Date(),
                    })
                    .where(
                        eq(
                            vehicleModels.id,
                            existingModel.id,
                        ),
                    );

                continue;
            }

            /*
             * Avoid a slug collision within the same make.
             * This also produces a useful error if the catalog
             * contains conflicting model definitions.
             */
            const existingSlug =
                await db.query.vehicleModels.findFirst({
                    where: and(
                        eq(
                            vehicleModels.makeId,
                            make.id,
                        ),
                        eq(
                            vehicleModels.slug,
                            modelSlug,
                        ),
                    ),
                });

            if (existingSlug) {
                throw new Error(
                    [
                        `Model slug conflict for ${make.name}.`,
                        `Model: ${modelSeed.name}.`,
                        `Slug: ${modelSlug}.`,
                    ].join(" "),
                );
            }

            await db
                .insert(vehicleModels)
                .values({
                    makeId: make.id,
                    name: modelSeed.name,
                    slug: modelSlug,
                    aliases: modelSeed.aliases ?? [],
                    nigeriaMarket:
                        modelSeed.nigeriaMarket ??
                        makeSeed.nigeriaMarket ??
                        true,
                    active: true,
                });

            modelsCreated += 1;
        }
    }

    console.log("\n====================================");
    console.log("KARMASS VEHICLE CATALOG SEED COMPLETE");
    console.log("====================================");
    console.log(`Makes created: ${makesCreated}`);
    console.log(`Makes already present: ${makesExisting}`);
    console.log(`Models created: ${modelsCreated}`);
    console.log(`Models already present: ${modelsExisting}`);
    console.log(`Makes in seed catalog: ${catalog.length}`);
    console.log(
        `Models in seed catalog: ${
            catalog.reduce(
                (total, make) => total + make.models.length,
                0,
            )
        }`,
    );
}

/**
 * RUN
 */
seedCatalog()
    .then(() => {
        console.log("\nVehicle catalog seed finished successfully.");
        process.exitCode = 0;
    })
    .catch((error: unknown) => {
        console.error("\nVehicle catalog seed failed.");

        if (error instanceof Error) {
            console.error(error.message);
            console.error(error.stack);
        } else {
            console.error(error);
        }

        process.exitCode = 1;
    });